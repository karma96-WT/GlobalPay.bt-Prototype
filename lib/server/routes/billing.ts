import { query, tx, Q } from '../db';
import { route, bad, HttpError, mid } from '../registry';
import { notify, audit, queueEmail } from '../util';
import { buildAR } from '../../bfs';
import { PLAN_SEATS } from '../../rbac';

const plans = async () =>
  (await query("SELECT value FROM platform_settings WHERE key = 'plans'"))[0].value as Record<
    string,
    { fee_minor: number }
  >;

/** Make a plan active for one more month (after a BFS payment, or when staff record a manual payment). */
export async function activateSubscription(
  q: Q,
  merchantId: string,
  plan: string,
  amount: number,
  method: string,
  orderNo?: string | null,
  providerTxnId?: string | null,
  staffId?: string,
  note?: string,
) {
  const [cur] = await q(
    'SELECT period_end, plan, status FROM subscriptions WHERE merchant_id = $1',
    [merchantId],
  );
  const sameLive =
    cur &&
    cur.status === 'Active' &&
    cur.plan === plan &&
    cur.period_end &&
    cur.period_end >= new Date().toISOString().slice(0, 10);
  const [r] = await q(
    `SELECT (CASE WHEN $1::boolean THEN $2::date ELSE CURRENT_DATE END) AS s,
            ((CASE WHEN $1::boolean THEN $2::date ELSE CURRENT_DATE END) + interval '1 month')::date AS e`,
    [!!sameLive, cur?.period_end ?? null],
  );
  await q(
    `INSERT INTO subscriptions (merchant_id, plan, status, period_start, period_end, reminder_for, updated_at) VALUES ($1,$2,'Active',$3,$4,NULL,now())
     ON CONFLICT (merchant_id) DO UPDATE SET plan = $2, status = 'Active', period_start = $3, period_end = $4, reminder_for = NULL, updated_at = now()`,
    [merchantId, plan, r.s, r.e],
  );
  await q('UPDATE merchants SET plan = $2 WHERE id = $1', [merchantId, plan]);
  await q(
    'INSERT INTO subscription_payments (merchant_id, plan, amount_minor, method, period_start, period_end, order_no, provider_txn_id, recorded_by, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      merchantId,
      plan,
      amount,
      method,
      r.s,
      r.e,
      orderNo ?? null,
      providerTxnId ?? null,
      staffId ?? null,
      note ?? null,
    ],
  );
  const [m] = await q('SELECT legal_name FROM merchants WHERE id = $1', [merchantId]);
  await notify(
    'merchant',
    'Billing',
    `${plan} plan active until ${r.e}`,
    method === 'Waived'
      ? 'GlobalPay.bt extended your plan.'
      : `Your subscription payment was received (${method}).`,
    merchantId,
    q,
  );
  await notify(
    'admin',
    'Subscription',
    `${m.legal_name}: ${plan} ${method === 'Waived' ? 'extended' : 'paid'}`,
    `Plan active until ${r.e} (${method}).`,
    null,
    q,
  );
  return r.e as string;
}

async function downgrade(q: Q, merchantId: string) {
  const [{ n }] = await q(
    "SELECT count(*)::int AS n FROM users WHERE merchant_id = $1 AND status = 'active'",
    [merchantId],
  );
  if (n > PLAN_SEATS.Basic)
    throw new HttpError(
      409,
      `The Basic plan includes ${PLAN_SEATS.Basic} team seats. Remove members first (you have ${n}).`,
    );
  await q(
    "INSERT INTO subscriptions (merchant_id, plan, status) VALUES ($1,'Basic','Active') ON CONFLICT (merchant_id) DO UPDATE SET plan = 'Basic', status = 'Active', period_start = NULL, period_end = NULL, reminder_for = NULL, updated_at = now()",
    [merchantId],
  );
  await q("UPDATE merchants SET plan = 'Basic' WHERE id = $1", [merchantId]);
}

route('GET', 'subscription', { scope: 'merchant', perm: ['plan.manage'] }, async (c) => {
  const m = mid(c);
  const [s] = await query(
    'SELECT *, (period_end - CURRENT_DATE) AS days_left FROM subscriptions WHERE merchant_id = $1',
    [m],
  );
  const pay = await query(
    'SELECT id, plan, amount_minor, method, period_start, period_end, created_at FROM subscription_payments WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 20',
    [m],
  );
  return {
    plan: s.plan,
    status: s.status,
    periodEnd: s.period_end,
    daysLeft: s.days_left,
    plans: await plans(),
    payments: pay,
  };
});

/** Paying a plan fee goes through BFS Secure like a customer payment, but to GlobalPay.bt's own beneficiary ID. */
route('POST', 'subscription/start', { scope: 'merchant', perm: ['plan.manage'] }, async (c) => {
  const m = mid(c);
  const { plan } = await c.json();
  const p = await plans();
  if (!p[plan]) throw bad('Unknown plan');
  if (plan === 'Basic') {
    await tx(async (q) => {
      await downgrade(q, m);
      await notify(
        'merchant',
        'Billing',
        'Plan changed to Basic',
        'Basic is free. Team seats are limited to 2.',
        m,
        q,
      );
      await audit(c.user.id, 'subscription.downgraded', 'merchant', m, null, c.ip, q);
    });
    return { ok: true };
  }
  const [bene] = await query(
    "SELECT value->>'id' AS id FROM platform_settings WHERE key = 'platform_beneficiary'",
  );
  const ar = await buildAR({
    benfId: bene.id,
    bank: '01',
    amountMinor: p[plan].fee_minor,
    desc: `GlobalPay ${plan} plan`,
    email: c.user.email,
  });
  await tx(async (q) => {
    await q(
      "INSERT INTO payment_attempts (order_no, kind, merchant_id, plan, amount_minor, benf_id, created_by) VALUES ($1,'subscription',$2,$3,$4,$5,$6)",
      [ar.bfs_orderNo, m, plan, p[plan].fee_minor, bene.id, c.user.id],
    );
    await q(
      "INSERT INTO provider_messages (order_no, direction, msg_type, payload) VALUES ($1,'OUTBOUND','AR',$2)",
      [ar.bfs_orderNo, JSON.stringify(ar)],
    );
  });
  return { ar };
});

// ============ admin: manage every merchant's subscription ============
route('GET', 'admin/subscriptions', { perm: ['subscription.manage'] }, async () => {
  const rows = await query(
    `SELECT m.id, m.legal_name, s.plan, s.status, s.period_end, (s.period_end - CURRENT_DATE) AS days_left, o.email AS owner_email, o.full_name AS owner_name,
            (SELECT max(created_at) FROM subscription_payments p WHERE p.merchant_id = m.id) AS last_paid
       FROM merchants m JOIN subscriptions s ON s.merchant_id = m.id
       LEFT JOIN LATERAL (SELECT email, full_name FROM users u WHERE u.merchant_id = m.id AND u.role_code = 'MERCHANT_OWNER' ORDER BY created_at LIMIT 1) o ON true
      ORDER BY s.period_end NULLS LAST, m.legal_name`,
  );
  const pay = await query(
    `SELECT p.id, m.legal_name, p.plan, p.amount_minor, p.method, p.period_end, p.created_at FROM subscription_payments p JOIN merchants m ON m.id = p.merchant_id ORDER BY p.created_at DESC LIMIT 50`,
  );
  const outbox = await query(
    "SELECT to_email, subject, status, created_at FROM email_outbox WHERE kind = 'reminder' ORDER BY created_at DESC LIMIT 10",
  );
  return {
    merchants: rows.map((r) => ({
      id: r.id,
      name: r.legal_name,
      plan: r.plan,
      status: r.status,
      periodEnd: r.period_end,
      daysLeft: r.days_left,
      owner: r.owner_name,
      ownerEmail: r.owner_email,
      lastPaid: r.last_paid,
    })),
    payments: pay,
    reminders: outbox,
    plans: await plans(),
  };
});

route('POST', 'admin/subscriptions/:id/action', { perm: ['subscription.manage'] }, async (c) => {
  const b = await c.json();
  const [m] = await query('SELECT id, legal_name FROM merchants WHERE id = $1', [c.p.id]);
  if (!m) throw new HttpError(404, 'Merchant not found');
  const [s] = await query('SELECT plan FROM subscriptions WHERE merchant_id = $1', [m.id]);
  const p = await plans();
  const plan = b.plan || s.plan;
  if (!p[plan]) throw bad('Unknown plan');
  await tx(async (q) => {
    if (b.action === 'remind') {
      await remind(q, m.id);
    } else if (
      plan === 'Basic' &&
      ['set-plan', 'extend', 'mark-paid', 'waive'].includes(b.action)
    ) {
      await downgrade(q, m.id);
    } else if (b.action === 'extend' || b.action === 'mark-paid' || b.action === 'set-plan') {
      await activateSubscription(
        q,
        m.id,
        plan,
        p[plan].fee_minor,
        'Manual',
        null,
        null,
        c.user.id,
        b.note || 'Payment received outside the platform',
      );
    } else if (b.action === 'waive') {
      await activateSubscription(
        q,
        m.id,
        plan,
        0,
        'Waived',
        null,
        null,
        c.user.id,
        b.note || 'Extended by GlobalPay.bt',
      );
    } else throw bad('Unknown action');
    await audit(c.user.id, `subscription.${b.action}`, 'merchant', m.id, { plan }, c.ip, q);
  });
  return { ok: true };
});

/** Email the business owners and the business address about a subscription that ends soon. */
async function remind(q: Q, merchantId: string) {
  const [s] = await q(
    'SELECT s.plan, s.period_end, (s.period_end - CURRENT_DATE) AS d, m.legal_name, m.email FROM subscriptions s JOIN merchants m ON m.id = s.merchant_id WHERE s.merchant_id = $1',
    [merchantId],
  );
  if (!s?.period_end) throw bad('This merchant is on the free Basic plan');
  const to = new Set<string>(
    [
      s.email,
      ...(
        await q(
          "SELECT email FROM users WHERE merchant_id = $1 AND role_code = 'MERCHANT_OWNER' AND status = 'active'",
          [merchantId],
        )
      ).map((u) => u.email),
    ].filter(Boolean),
  );
  const when = s.d <= 0 ? 'has ended' : s.d === 1 ? 'ends tomorrow' : `ends in ${s.d} days`;
  for (const e of to)
    await queueEmail(
      e,
      `Your GlobalPay.bt ${s.plan} subscription ${when}`,
      `Hello,\n\nThe ${s.plan} subscription for ${s.legal_name} ${when} (${s.period_end}).\n\nRenew under Settings, Plan and billing in your GlobalPay.bt account to keep your plan features, including team seats.\n\nThank you,\nGlobalPay.bt`,
      'reminder',
      q,
    );
  await q('UPDATE subscriptions SET reminder_for = period_end WHERE merchant_id = $1', [
    merchantId,
  ]);
  await notify(
    'merchant',
    'Billing',
    `Subscription ${when}`,
    `Your ${s.plan} plan ends on ${s.period_end}. A reminder was emailed to ${[...to].join(', ')}.`,
    merchantId,
    q,
  );
  await notify(
    'admin',
    'Subscription',
    `Reminder sent to ${s.legal_name}`,
    `${s.plan} plan ${when}.`,
    null,
    q,
  );
}

/** Expire plans that ran out and send the 3-day reminders. Runs daily (cron) or on demand (admin). */
export async function runReminders() {
  return tx(async (q) => {
    const expired = await q(
      "UPDATE subscriptions SET status = 'Expired', updated_at = now() WHERE plan <> 'Basic' AND status = 'Active' AND period_end < CURRENT_DATE RETURNING merchant_id, plan",
    );
    for (const e of expired) {
      await q("UPDATE merchants SET plan = 'Basic' WHERE id = $1", [e.merchant_id]);
      await notify(
        'merchant',
        'Billing',
        `${e.plan} plan expired`,
        'Your plan ended and your account moved to Basic. Renew to restore your plan features.',
        e.merchant_id,
        q,
      );
    }
    const due = await q(
      "SELECT merchant_id FROM subscriptions WHERE plan <> 'Basic' AND status = 'Active' AND period_end >= CURRENT_DATE AND period_end - CURRENT_DATE <= 3 AND reminder_for IS DISTINCT FROM period_end",
    );
    for (const d of due) await remind(q, d.merchant_id);
    return { expired: expired.length, reminded: due.length };
  });
}
route('POST', 'admin/reminders/run', { perm: ['subscription.manage'] }, async () => runReminders());
route('GET', 'cron/reminders', { auth: false }, async (c) => {
  if (
    !process.env.CRON_SECRET ||
    c.req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  )
    throw new HttpError(401, 'Not allowed');
  return runReminders();
});

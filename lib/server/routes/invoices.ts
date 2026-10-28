import { query, tx, Q } from '../db';
import { route, bad, HttpError, Ctx, mid } from '../registry';
import { notify, audit, queueEmail, appUrl } from '../util';
import { randomToken } from '../auth';
import { ensureReceipt } from '../receipt';
import { calc, nu } from '../../calc';
import { MOBILE_RE, EMAIL_RE } from '../../validation';
import { buildAR, bfsSign, RC } from '../../bfs';

export async function loadInvoices(where: string, params: any[]) {
  const rows = await query(
    `SELECT i.*, EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = i.id AND t.status = 'Failed') AS failed
       FROM invoices i ${where} ORDER BY i.created_at DESC`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = await query(
    'SELECT * FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY line_no',
    [ids],
  );
  const chs = await query(
    'SELECT * FROM invoice_charges WHERE invoice_id = ANY($1) ORDER BY line_no',
    [ids],
  );
  return rows.map((r) => ({
    id: r.id,
    no: r.invoice_no,
    token: r.pay_token,
    date: r.issue_date,
    cur: r.currency,
    merchant: r.merchant_snapshot,
    cust: {
      name: r.customer_name || '',
      email: r.customer_email || '',
      mobile: r.customer_mobile || '',
    },
    items: items
      .filter((i) => i.invoice_id === r.id)
      .map((i) => ({
        d: i.description,
        q: Number(i.quantity),
        p: i.unit_price_minor / 100,
        disc: { kind: i.discount_kind, v: Number(i.discount_value) },
      })),
    charges: chs
      .filter((x) => x.invoice_id === r.id)
      .map((x) => ({ kind: x.kind, label: x.label || '', mode: x.mode, v: Number(x.value) })),
    notes: r.notes || '',
    status: r.status,
    sentTo: r.sent_to,
    sentAt: r.sent_at,
    txnRef: r.txn_ref,
    paidAt: r.paid_at,
    total: r.total_minor,
    failed: r.failed,
  }));
}

/** Validate the invoice form and work out the total on the server (never trust the browser's maths). */
function clean(b: any) {
  const items = (b.items || []).map((i: any) => ({
    d: String(i.d || '').trim(),
    q: Number(i.q),
    p: Number(i.p),
    disc: {
      kind: ['pct', 'amt'].includes(i.disc?.kind) ? i.disc.kind : 'none',
      v: Number(i.disc?.v || 0),
    },
  }));
  if (!items.length) throw bad('Add at least one item');
  for (const i of items) {
    if (!i.d) throw bad('Every item needs a description');
    if (!(i.q > 0)) throw bad('Quantity must be more than zero');
    if (!(i.p > 0)) throw bad('Unit price must be more than zero');
    if (i.disc.v < 0 || (i.disc.kind === 'pct' && i.disc.v > 100))
      throw bad('A percentage discount must be between 0 and 100');
  }
  const charges = (b.charges || []).map((c: any) => ({
    kind: c.kind,
    label: String(c.label || '').trim(),
    mode: c.mode === 'pct' ? 'pct' : 'amt',
    v: Number(c.v),
  }));
  for (const c of charges) {
    if (!['Tax', 'Delivery', 'Service', 'Other'].includes(c.kind))
      throw bad('Choose a charge type');
    if (c.kind === 'Other' && !c.label) throw bad('Say what the "Other" charge is for');
    if (!(c.v >= 0)) throw bad('A charge cannot be negative');
  }
  const cust = {
    name: String(b.customer?.name || '').trim(),
    email: String(b.customer?.email || '').trim(),
    mobile: String(b.customer?.mobile || '').replace(/\s/g, ''),
  };
  if (cust.email && !EMAIL_RE.test(cust.email)) throw bad('Enter a valid customer email');
  if (cust.mobile && !MOBILE_RE.test(cust.mobile))
    throw bad('Customer mobile must be +975 followed by 17, 16 or 77 and six more digits');
  const total = calc(items, charges).total;
  if (!(total > 0)) throw bad('The invoice total must be more than zero');
  return { items, charges, cust, total, notes: String(b.notes || '').trim() };
}
async function writeLines(q: Q, id: string, x: ReturnType<typeof clean>) {
  await q('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
  await q('DELETE FROM invoice_charges WHERE invoice_id = $1', [id]);
  for (const [n, i] of x.items.entries())
    await q(
      'INSERT INTO invoice_items (invoice_id, line_no, description, quantity, unit_price_minor, discount_kind, discount_value) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, n + 1, i.d, i.q, Math.round(i.p * 100), i.disc.kind, i.disc.v],
    );
  for (const [n, ch] of x.charges.entries())
    await q(
      'INSERT INTO invoice_charges (invoice_id, line_no, kind, label, mode, value) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, n + 1, ch.kind, ch.label || null, ch.mode, ch.v],
    );
}

route('GET', 'invoices', { scope: 'merchant', perm: ['invoice.view'] }, async (c) =>
  c.user.merchantId ? loadInvoices('WHERE i.merchant_id = $1', [c.user.merchantId]) : [],
);

route('POST', 'invoices', { scope: 'merchant', perm: ['invoice.create'] }, async (c) => {
  const m = mid(c);
  const x = clean(await c.json());
  const [conn] = await query(
    `SELECT p.* FROM merchant_provider_accounts p WHERE p.merchant_id = $1 AND p.provider = 'RMA' AND p.enabled
        AND EXISTS (SELECT 1 FROM applications a WHERE a.merchant_id = p.merchant_id AND a.provider = 'RMA' AND a.status = 'Approved')`,
    [m],
  );
  if (!conn) throw new HttpError(409, 'RMA is not approved and switched on for your business');
  const [biz] = await query(
    'SELECT legal_name, address, phone, email FROM merchants WHERE id = $1',
    [m],
  );
  const year = new Date().getUTCFullYear();
  const [{ n }] = await query(
    "SELECT COALESCE(max(substring(invoice_no from '[0-9]+$')::int), 17) + 1 AS n FROM invoices WHERE merchant_id = $1 AND invoice_no LIKE $2",
    [m, `INV-${year}-%`],
  );
  const no = `INV-${year}-${String(n).padStart(4, '0')}`;
  const id = await tx(async (q) => {
    const [r] = await q(
      `INSERT INTO invoices (merchant_id, invoice_no, pay_token, merchant_snapshot, customer_name, customer_email, customer_mobile, notes, total_minor, benf_id, benf_bank, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        m,
        no,
        randomToken(18),
        JSON.stringify({
          name: biz.legal_name,
          addr: biz.address,
          phone: biz.phone,
          email: biz.email,
        }),
        x.cust.name || null,
        x.cust.email || null,
        x.cust.mobile || null,
        x.notes || null,
        x.total,
        conn.beneficiary_id,
        conn.bank_code,
        c.user.id,
      ],
    );
    await writeLines(q, r.id, x);
    await audit(c.user.id, 'invoice.created', 'invoice', no, { total: x.total }, c.ip, q);
    return r.id;
  });
  return (await loadInvoices('WHERE i.id = $1', [id]))[0];
});

async function mine(c: Ctx) {
  const [i] = await loadInvoices('WHERE i.id = $1 AND i.merchant_id = $2', [
    c.p.id,
    c.user.merchantId,
  ]);
  if (!i) throw new HttpError(404, 'Invoice not found');
  return i;
}
route('PUT', 'invoices/:id', { scope: 'merchant', perm: ['invoice.create'] }, async (c) => {
  const i = await mine(c);
  if (i.sentAt || i.status !== 'Unpaid')
    throw new HttpError(409, 'A sent invoice cannot be edited. Cancel it and create a new one.');
  const x = clean(await c.json());
  await tx(async (q) => {
    await q(
      'UPDATE invoices SET customer_name = $2, customer_email = $3, customer_mobile = $4, notes = $5, total_minor = $6 WHERE id = $1',
      [
        i.id,
        x.cust.name || null,
        x.cust.email || null,
        x.cust.mobile || null,
        x.notes || null,
        x.total,
      ],
    );
    await writeLines(q, i.id, x);
  });
  return (await loadInvoices('WHERE i.id = $1', [i.id]))[0];
});

route('POST', 'invoices/:id/action', { scope: 'merchant', perm: ['invoice.create'] }, async (c) => {
  const i = await mine(c);
  const b = await c.json();
  if (b.action === 'cancel') {
    if (i.status !== 'Unpaid') throw new HttpError(409, 'Only unpaid invoices can be cancelled');
    await query("UPDATE invoices SET status = 'Cancelled' WHERE id = $1", [i.id]);
    await notify(
      'merchant',
      'Invoice',
      `Invoice ${i.no} cancelled`,
      'The payment link no longer accepts payment.',
      c.user.merchantId,
    );
    await audit(c.user.id, 'invoice.cancelled', 'invoice', i.no, null, c.ip);
    return { ok: true };
  }
  if (b.action === 'send' || b.action === 'resend') {
    if (i.status !== 'Unpaid') throw new HttpError(409, 'Only unpaid invoices can be sent');
    const to = String(b.to || i.sentTo || i.cust.email).trim();
    if (!EMAIL_RE.test(to)) throw bad('Enter a valid email address to send the invoice to');
    await query(
      'UPDATE invoices SET sent_to = $2, sent_at = now(), customer_email = COALESCE(customer_email, $2) WHERE id = $1',
      [i.id, to],
    );
    const link = `${appUrl(c.req)}/pay/${i.token}`;
    await queueEmail(
      to,
      `Invoice ${i.no} from ${i.merchant.name}`,
      `Hello${i.cust.name ? ' ' + i.cust.name : ''},\n\n${i.merchant.name} has sent you invoice ${i.no} for ${nu(i.total)}.\n\nPay securely with your bank account: ${link}\n\n${i.notes ? i.notes + '\n\n' : ''}GlobalPay.bt never sees your bank details.`,
      'invoice',
    );
    await notify(
      'merchant',
      'Invoice',
      `Invoice ${i.no} ${b.action === 'resend' ? 're-sent' : 'sent'}`,
      `Emailed to ${to} for ${nu(i.total)} with a payment link.`,
      c.user.merchantId,
    );
    await audit(c.user.id, 'invoice.sent', 'invoice', i.no, { to }, c.ip);
    return { ok: true };
  }
  throw bad('Unknown action');
});

route('GET', 'transactions', { scope: 'merchant', perm: ['payment.view'] }, async (c) => {
  if (!c.user.merchantId) return [];
  const rows = await query(
    `SELECT t.*, i.invoice_no, EXISTS (SELECT 1 FROM receipts r WHERE r.txn_id = t.id) AS has_receipt
       FROM transactions t LEFT JOIN invoices i ON i.id = t.invoice_id WHERE t.merchant_id = $1 ORDER BY t.occurred_at DESC`,
    [c.user.merchantId],
  );
  return rows.map(txnJson);
});
export const txnJson = (t: any) => ({
  id: t.id,
  at: t.occurred_at,
  amount: t.amount_minor,
  prov: t.provider,
  status: t.status,
  kind: t.kind,
  invoiceNo: t.invoice_no || null,
  customer: t.customer_name || '',
  email: t.customer_email || '',
  providerTxnId: t.provider_txn_id,
  code: t.response_code,
  merchant: t.legal_name,
});
route('GET', 'receipts/:txn', { perm: ['payment.view', 'transaction.view'] }, async (c) => {
  const [t] = await query('SELECT merchant_id FROM transactions WHERE id = $1', [c.p.txn]);
  if (!t || (c.user.scope === 'merchant' && t.merchant_id !== c.user.merchantId))
    throw new HttpError(404, 'Receipt not found');
  const r = await ensureReceipt(c.p.txn);
  if (!r) throw new HttpError(404, 'Receipts exist for successful payments only');
  return new Response(r.pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${r.number}.pdf"`,
    },
  });
});

// ============ public payment pages (the customer is not signed in) ============
route('GET', 'public/invoice/:token', { auth: false }, async (c) => {
  const [i] = await loadInvoices('WHERE i.pay_token = $1', [c.p.token]);
  if (!i) throw new HttpError(404, 'Invoice not found');
  const { id, ...rest } = i;
  return rest;
});

route('POST', 'public/pay/start', { auth: false }, async (c) => {
  const b = await c.json();
  const [i] = await loadInvoices('WHERE i.pay_token = $1', [String(b.token || '')]);
  if (!i) throw new HttpError(404, 'Invoice not found');
  if (i.status !== 'Unpaid')
    throw new HttpError(
      409,
      i.status === 'Paid' ? 'This invoice is already paid' : 'This invoice was cancelled',
    );
  const [m] = await query('SELECT merchant_id, benf_id, benf_bank FROM invoices WHERE id = $1', [
    i.id,
  ]);
  const [conn] = await query(
    "SELECT enabled FROM merchant_provider_accounts WHERE merchant_id = $1 AND provider = 'RMA'",
    [m.merchant_id],
  );
  if (!conn?.enabled)
    throw new HttpError(409, 'This merchant is not accepting payments through RMA right now');
  const ar = await buildAR({
    benfId: m.benf_id,
    bank: m.benf_bank || '01',
    amountMinor: i.total,
    desc: `${i.no} ${i.merchant.name}`,
    email: i.cust.email,
  });
  await tx(async (q) => {
    await q(
      "INSERT INTO payment_attempts (order_no, kind, merchant_id, invoice_id, amount_minor, benf_id) VALUES ($1,'invoice',$2,$3,$4,$5)",
      [ar.bfs_orderNo, m.merchant_id, i.id, i.total, m.benf_id],
    );
    await q(
      "INSERT INTO provider_messages (order_no, direction, msg_type, payload) VALUES ($1,'OUTBOUND','AR',$2)",
      [ar.bfs_orderNo, JSON.stringify(ar)],
    );
  });
  return { ar };
});

/** BFS Secure sends the AC message back; check it and record the payment, once. */
export async function completePayment(ac: any, ip = '') {
  const [att] = await query('SELECT * FROM payment_attempts WHERE order_no = $1', [
    String(ac?.bfs_orderNo || ''),
  ]);
  if (!att) throw new HttpError(404, 'Unknown payment');
  const checks = {
    sig: (await bfsSign(ac)) === ac.bfs_checkSum,
    amt: Math.round(Number(ac.bfs_txnAmount) * 100) === att.amount_minor,
    benf: ac.bfs_benfId === att.benf_id,
  };
  const [dupe] = await query(
    "SELECT t.* FROM transactions t WHERE t.provider = 'RMA' AND t.provider_txn_id = $1",
    [ac.bfs_bfsTxnId],
  );
  if (dupe)
    return {
      status: dupe.status,
      code: dupe.response_code,
      txnId: dupe.id,
      kind: att.kind,
      checks,
      duplicate: true,
    };
  const ok = checks.sig && checks.amt && checks.benf && ac.bfs_debitAuthCode === '00';
  const [inv] = att.invoice_id
    ? await query('SELECT * FROM invoices WHERE id = $1', [att.invoice_id])
    : [null];
  const id = 'TX-' + String(ac.bfs_bfsTxnId).slice(-6);
  const [hit] = await query('SELECT 1 FROM transactions WHERE id = $1', [id]);
  const txnId = hit ? id + '-' + randomToken(2) : id;

  await tx(async (q) => {
    await q(
      `INSERT INTO transactions (id, merchant_id, invoice_id, kind, provider, amount_minor, status, customer_name, customer_email, order_no, provider_txn_id, response_code)
       VALUES ($1,$2,$3,$4,'RMA',$5,$6,$7,$8,$9,$10,$11)`,
      [
        txnId,
        att.merchant_id,
        att.invoice_id,
        att.kind,
        att.amount_minor,
        ok ? 'Successful' : 'Failed',
        inv?.customer_name ?? null,
        inv?.customer_email ?? null,
        att.order_no,
        ac.bfs_bfsTxnId,
        ac.bfs_debitAuthCode,
      ],
    );
    await q(
      "INSERT INTO provider_messages (order_no, transaction_id, direction, msg_type, payload, signature_valid) VALUES ($1,$2,'INBOUND','AC',$3,$4)",
      [att.order_no, txnId, JSON.stringify(ac), checks.sig],
    );
    const amount = nu(att.amount_minor);
    if (att.kind === 'invoice') {
      if (ok)
        await q(
          "UPDATE invoices SET status = 'Paid', txn_ref = $2, paid_at = now() WHERE id = $1 AND status = 'Unpaid'",
          [att.invoice_id, ac.bfs_bfsTxnId],
        );
      await notify(
        'merchant',
        'Payment',
        ok ? `Payment ${txnId} received` : `Payment ${txnId} failed`,
        ok
          ? `${amount} received through RMA for invoice ${inv.invoice_no}${inv.customer_name ? ' from ' + inv.customer_name : ''}.`
          : `${amount}${inv.customer_name ? ' from ' + inv.customer_name : ''} failed with code ${ac.bfs_debitAuthCode} (${RC[ac.bfs_debitAuthCode] || 'Unknown'}). The customer can retry from the same link.`,
        att.merchant_id,
        q,
      );
    } else if (ok) {
      const { activateSubscription } = await import('./billing');
      await activateSubscription(
        q,
        att.merchant_id,
        att.plan,
        att.amount_minor,
        'BFS Secure',
        att.order_no,
        ac.bfs_bfsTxnId,
      );
    } else {
      await notify(
        'merchant',
        'Billing',
        'Subscription payment failed',
        `${amount} for the ${att.plan} plan failed with code ${ac.bfs_debitAuthCode} (${RC[ac.bfs_debitAuthCode] || 'Unknown'}). Try again under Settings, Plan and billing.`,
        att.merchant_id,
        q,
      );
    }
    await audit(
      null,
      ok ? 'payment.recorded' : 'payment.failed',
      'transaction',
      txnId,
      { kind: att.kind, code: ac.bfs_debitAuthCode },
      ip,
      q,
    );
  });
  if (ok) await ensureReceipt(txnId);
  return {
    status: ok ? 'Successful' : 'Failed',
    code: ac.bfs_debitAuthCode,
    txnId,
    kind: att.kind,
    checks,
  };
}
route('POST', 'public/pay/complete', { auth: false }, async (c) =>
  completePayment((await c.json()).ac, c.ip),
);

route('GET', 'public/receipt/:txn', { auth: false }, async (c) => {
  const [t] = await query(
    'SELECT t.id, i.pay_token FROM transactions t JOIN invoices i ON i.id = t.invoice_id WHERE t.id = $1',
    [c.p.txn],
  );
  if (!t || t.pay_token !== c.url.searchParams.get('t'))
    throw new HttpError(404, 'Receipt not found');
  const r = await ensureReceipt(t.id);
  if (!r) throw new HttpError(404, 'Receipts exist for successful payments only');
  return new Response(r.pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${r.number}.pdf"`,
    },
  });
});

import { query } from '../db';
import { route, bad, HttpError, Ctx } from '../registry';
import { notify, audit, queueEmail } from '../util';

const audience = (c: Ctx) =>
  c.user.scope === 'merchant' ? 'merchant' : c.user.roleCode === 'ADMIN' ? 'admin' : 'operator';

// ---------- notifications: search and filter ----------
route('GET', 'notifications', {}, async (c) => {
  const s = c.url.searchParams;
  const where = ['audience = $1', "($1 <> 'merchant' OR merchant_id = $2)"];
  const p: any[] = [audience(c), c.user.merchantId];
  if (s.get('q')) {
    p.push('%' + s.get('q') + '%');
    where.push(`(title ILIKE $${p.length} OR body ILIKE $${p.length})`);
  }
  if (s.get('cat')) {
    p.push(s.get('cat'));
    where.push(`category = $${p.length}`);
  }
  if (s.get('from')) {
    p.push(s.get('from'));
    where.push(`created_at >= $${p.length}::date`);
  }
  if (s.get('to')) {
    p.push(s.get('to'));
    where.push(`created_at < ($${p.length}::date + 1)`);
  }
  if (s.get('unread') === '1') where.push('NOT read');
  const rows = await query(
    `SELECT id, category, title, body, read, created_at FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
    p,
  );
  return rows.map((r) => ({
    id: r.id,
    cat: r.category,
    title: r.title,
    body: r.body,
    read: r.read,
    at: r.created_at,
  }));
});
route('POST', 'notifications/read', {}, async (c) => {
  const b = await c.json();
  await query(
    `UPDATE notifications SET read = true WHERE audience = $1 AND ($1 <> 'merchant' OR merchant_id = $2) AND ($3::boolean OR id = ANY($4::uuid[]))`,
    [audience(c), c.user.merchantId, !!b.all, b.ids || []],
  );
  return { ok: true };
});

// ---------- contacts shown on the merchant Support page ----------
route(
  'GET',
  'contacts',
  {},
  async () =>
    (await query("SELECT value FROM platform_settings WHERE key = 'contacts'"))[0]?.value || {},
);

// ---------- support (to operators) and feedback (to admins) ----------
const ticketJson = (t: any, msgs: any[]) => ({
  no: t.no,
  kind: t.kind,
  subject: t.subject,
  cat: t.category,
  status: t.status,
  created: t.created_at,
  biz: t.legal_name || '—',
  contact: t.contact,
  msgs: msgs
    .filter((m) => m.ticket_no === t.no)
    .map((m) => ({
      from: m.author_type,
      by: m.author_name,
      at: m.created_at,
      body: m.body,
      emailedTo: m.emailed_to,
    })),
});
async function visible(c: Ctx, no?: string) {
  const p: any[] = [];
  let where = '';
  if (c.user.scope === 'merchant') {
    p.push(c.user.id, c.user.merchantId);
    where =
      "WHERE (t.opened_by = $1 AND t.kind = 'feedback') OR (t.merchant_id = $2 AND t.kind = 'support')";
  } else if (c.user.perms.includes('support.reply') && !c.user.perms.includes('feedback.handle'))
    where = "WHERE t.kind = 'support'";
  else if (c.user.perms.includes('feedback.handle') && !c.user.perms.includes('support.reply'))
    where = "WHERE t.kind = 'feedback'";
  else throw new HttpError(403, 'Your role does not allow this');
  if (no) {
    p.push(no);
    where = `WHERE t.no = $${p.length} AND (${where.replace('WHERE ', '') || 'true'})`;
  }
  const rows = await query(
    `SELECT t.*, m.legal_name FROM support_tickets t LEFT JOIN merchants m ON m.id = t.merchant_id ${where} ORDER BY t.created_at DESC`,
    p,
  );
  const msgs = rows.length
    ? await query('SELECT * FROM ticket_messages WHERE ticket_no = ANY($1) ORDER BY created_at', [
        rows.map((r) => r.no),
      ])
    : [];
  return rows.map((r) => ticketJson(r, msgs));
}
route('GET', 'tickets', {}, async (c) => visible(c));

route('POST', 'tickets', {}, async (c) => {
  const b = await c.json();
  const kind = b.kind === 'feedback' ? 'feedback' : 'support';
  const subject = String(b.subject || '').trim();
  const body = String(b.body || '').trim();
  if (!subject || !body) throw bad('Enter a subject and a message');
  if (
    kind === 'support' &&
    !(c.user.scope === 'merchant' && c.user.merchantId && c.user.perms.includes('support.manage'))
  )
    throw new HttpError(403, 'Your role does not allow this');
  const [{ n }] = await query("SELECT nextval('ticket_seq') AS n");
  const no = (kind === 'support' ? 'SUP-' : 'FDB-') + n;
  const contact = { name: c.user.name, email: c.user.email, phone: c.user.mobile };
  await query(
    'INSERT INTO support_tickets (no, kind, merchant_id, opened_by, contact, subject, category) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      no,
      kind,
      c.user.merchantId,
      c.user.id,
      JSON.stringify(contact),
      subject,
      b.category || 'Other',
    ],
  );
  await query(
    "INSERT INTO ticket_messages (ticket_no, author_type, author_name, body) VALUES ($1,'merchant',$2,$3)",
    [no, c.user.name, body],
  );
  const who = c.user.business ? `${c.user.business} (${c.user.name})` : c.user.name;
  await notify(
    kind === 'support' ? 'operator' : 'admin',
    kind === 'support' ? 'Support' : 'Feedback',
    `${kind === 'support' ? 'New support request' : 'New feedback'}: ${subject}`,
    `${who} opened ${no}.`,
  );
  if (c.user.merchantId)
    await notify(
      'merchant',
      'Support',
      `${kind === 'support' ? 'Support request' : 'Feedback'} ${no} submitted`,
      kind === 'support'
        ? `"${subject}". You will get the reply here and by email.`
        : `Thank you. Your feedback "${subject}" went to the GlobalPay.bt admin team.`,
      c.user.merchantId,
    );
  await audit(c.user.id, `${kind}.opened`, 'ticket', no, null, c.ip);
  return { ok: true, no };
});

route('POST', 'tickets/:no/messages', {}, async (c) => {
  const [t] = await visible(c, c.p.no);
  if (!t) throw new HttpError(404, 'Request not found');
  const body = String((await c.json()).body || '').trim();
  if (!body) throw bad('Write a message first');
  const staff = c.user.scope === 'platform';
  if (staff && !c.user.perms.includes(t.kind === 'support' ? 'support.reply' : 'feedback.handle'))
    throw new HttpError(403, 'Your role does not allow this');
  if (!staff && t.status === 'Resolved') throw new HttpError(409, 'This request is resolved');
  const to = staff ? t.contact.email : null;
  await query(
    'INSERT INTO ticket_messages (ticket_no, author_type, author_name, body, emailed_to) VALUES ($1,$2,$3,$4,$5)',
    [t.no, staff ? 'staff' : 'merchant', c.user.name, body, to],
  );
  await query('UPDATE support_tickets SET status = $2 WHERE no = $1', [
    t.no,
    staff ? 'In progress' : 'Open',
  ]);
  if (staff) {
    await queueEmail(
      to,
      `Re: ${t.subject} (${t.no})`,
      `Hello ${t.contact.name},\n\n${body}\n\n${c.user.name}\nGlobalPay.bt ${t.kind === 'support' ? 'Support' : 'Team'}`,
      'support',
    );
    const [row] = await query('SELECT merchant_id FROM support_tickets WHERE no = $1', [t.no]);
    if (row.merchant_id)
      await notify(
        'merchant',
        'Support',
        `Reply on ${t.no}: ${t.subject}`,
        body.slice(0, 160),
        row.merchant_id,
      );
  } else
    await notify(
      t.kind === 'support' ? 'operator' : 'admin',
      t.kind === 'support' ? 'Support' : 'Feedback',
      `Reply on ${t.no}`,
      `${c.user.name}: ${body.slice(0, 120)}`,
    );
  return { ok: true, emailedTo: to };
});

route(
  'PATCH',
  'tickets/:no',
  { scope: 'platform', perm: ['support.reply', 'feedback.handle'] },
  async (c) => {
    const [t] = await visible(c, c.p.no);
    if (!t) throw new HttpError(404, 'Request not found');
    const { status } = await c.json();
    if (!['Open', 'In progress', 'Resolved'].includes(status)) throw bad('Unknown status');
    await query('UPDATE support_tickets SET status = $2 WHERE no = $1', [t.no, status]);
    await audit(c.user.id, 'ticket.status', 'ticket', t.no, { status }, c.ip);
    return { ok: true };
  },
);

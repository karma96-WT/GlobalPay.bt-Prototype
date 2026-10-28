// npm run test:api  -  runs the real API handlers against an in-memory Postgres (no Neon needed).
import { call, ok, login, db, counts } from './harness.mjs';
const bfsMod: any = await import('../lib/bfs.ts');
const bfsSign = (bfsMod.bfsSign ?? bfsMod.default.bfsSign) as (f: any) => Promise<string>;

const owner = await login('owner@druktrails.bt');
const finance = await login('tshewang@druktrails.bt');
const dev = await login('dorji@druktrails.bt');
const support = await login('sonam@druktrails.bt');
const operator = await login('operator@globalpay.bt');
const admin = await login('admin@globalpay.bt');

// ---- sign in and RBAC
ok(
  'wrong password is refused',
  (await call('POST', 'auth/login', { email: 'owner@druktrails.bt', password: 'nope' }, ''))
    .status === 401,
);
ok('no cookie, no data', (await call('GET', 'invoices', undefined, '')).status === 401);
ok('owner sees invoices', (await call('GET', 'invoices', undefined, owner)).data.length === 4);
ok('finance sees invoices', (await call('GET', 'invoices', undefined, finance)).status === 200);
ok('finance cannot open team', (await call('GET', 'team', undefined, finance)).status === 403);
ok(
  'finance cannot toggle providers',
  (await call('POST', 'connections/toggle', { prov: 'RMA', on: false }, finance)).status === 403,
);
ok('developer cannot create invoices', (await call('POST', 'invoices', {}, dev)).status === 403);
ok('developer can see API keys', (await call('GET', 'keys', undefined, dev)).status === 200);
ok('support cannot see API keys', (await call('GET', 'keys', undefined, support)).status === 403);
ok(
  'operator cannot read merchant invoices',
  (await call('GET', 'invoices', undefined, operator)).status === 403,
);
ok(
  'admin cannot forward applications',
  (await call('POST', 'apps/GP-2610-0050/action', { action: 'forward' }, admin)).status === 403,
);
ok(
  'operator cannot open staff accounts',
  (await call('GET', 'admin/employees', undefined, operator)).status === 403,
);
const me = (await call('GET', 'me', undefined, owner)).data;
ok(
  'me returns permissions and subscription',
  me.perms.includes('team.manage') &&
    me.subscription.plan === 'Gold' &&
    me.subscription.daysLeft === 3,
  me,
);

// ---- registration and business onboarding
const bad = await call(
  'POST',
  'auth/register',
  { name: 'Lhamo Dema', email: 'lhamo@example.bt', mobile: '+97517888111', password: 'weakpass' },
  '',
);
ok(
  'weak password gets a clear message',
  bad.status === 400 && /uppercase/.test(bad.data.error),
  bad.data,
);
ok(
  'mobile prefix is enforced',
  (
    await call(
      'POST',
      'auth/register',
      { name: 'Lhamo Dema', email: 'l@e.bt', mobile: '+97518888111', password: 'Strong@123' },
      '',
    )
  ).status === 400,
);
const reg = await call(
  'POST',
  'auth/register',
  {
    name: 'Lhamo Dema',
    email: 'lhamo@example.bt',
    mobile: '+97517888111',
    password: 'Strong@123',
    emailConsent: true,
  },
  '',
);
ok('registration works', reg.status === 200 && !!reg.cookie, reg.data);
const newbie = reg.cookie;
ok(
  'new user sees no merchant data',
  (await call('GET', 'invoices', undefined, newbie)).data.length === 0 &&
    (await call('GET', 'team', undefined, newbie)).status === 403,
);
const meta = {
  business: {
    name: 'Lhamo Weaves',
    type: 'Sole proprietor',
    license: 'TL-2024-77001',
    address: 'Main Street, Haa',
    phone: '+97577123987',
    email: 'hello@lhamoweaves.bt',
    repName: 'Lhamo Dema',
    repCid: '10900100123',
  },
  providers: ['RMA'],
  route: 'docs',
  consent: { accuracy: true, providers: true, terms: true, privacy: true, email: true },
};
const form = new FormData();
form.set('meta', JSON.stringify(meta));
const pdf = (n: string) => new File([`%PDF-1.4 ${n}`], `${n}.pdf`, { type: 'application/pdf' });
for (const d of [
  'Business/Trade License Copy',
  'Company Registration Document',
  'CID Copy of authorised representative',
])
  form.set('RMA|' + d, pdf(d.slice(0, 5)));
const miss = await call('POST', 'business', undefined, newbie, form);
ok(
  'missing document is refused',
  miss.status === 400 && /Bank Account/.test(miss.data.error),
  miss.data,
);
form.set('RMA|Bank Account Confirmation Letter', pdf('bank'));
const biz = await call('POST', 'business', undefined, newbie, form);
ok('business registered', biz.status === 200 && biz.data.applications.length === 1, biz.data);
const appId = biz.data.applications[0];
ok(
  'operator sees the new application',
  (await call('GET', 'apps', undefined, operator)).data.some((a: any) => a.id === appId),
);
ok(
  'owner of the other business cannot open it',
  (await call('GET', 'apps', undefined, owner)).data.every((a: any) => a.id !== appId),
);
ok(
  'operator downloads a document',
  (
    await call(
      'GET',
      `files/${appId}/${encodeURIComponent('Business/Trade License Copy')}?download=1`,
      undefined,
      operator,
    )
  ).status === 200,
);
ok(
  'cannot forward before documents are accepted',
  (await call('POST', `apps/${appId}/action`, { action: 'forward' }, operator)).status === 409,
);
const docs = (await call('GET', 'apps', undefined, operator)).data.find(
  (a: any) => a.id === appId,
).docs;
for (const d of docs)
  await call('POST', `apps/${appId}/action`, { action: 'accept-doc', doc: d.n }, operator);
ok(
  'forward after accepting every document',
  (await call('POST', `apps/${appId}/action`, { action: 'forward' }, operator)).status === 200,
);
ok(
  'merchant locked out of editing after forward',
  (
    await call(
      'POST',
      `apps/${appId}/doc`,
      undefined,
      newbie,
      (() => {
        const f = new FormData();
        f.set('name', docs[0].n);
        f.set('file', pdf('x'));
        return f;
      })(),
    )
  ).status === 409,
);
ok(
  'beneficiary ID already used by another merchant is refused',
  (await call('POST', `apps/${appId}/action`, { action: 'accept', benfId: 'BE00000585' }, operator))
    .status === 409,
);
ok(
  'bad beneficiary ID format is refused',
  (await call('POST', `apps/${appId}/action`, { action: 'accept', benfId: 'be-1' }, operator))
    .status === 400,
);
ok(
  'operator records acceptance',
  (
    await call(
      'POST',
      `apps/${appId}/action`,
      { action: 'accept', benfId: 'BE00000777', bank: '02', ref: 'RMA/9' },
      operator,
    )
  ).status === 200,
);
const conn = (await call('GET', 'connections', undefined, newbie)).data;
ok('merchant sees beneficiary ID', conn[0]?.benfId === 'BE00000777' && conn[0].bank === '02', conn);
ok(
  'merchant stage moves to merchant',
  (await call('GET', 'me', undefined, newbie)).data.stage === 'merchant',
);
ok(
  'merchant was notified and emailed',
  (
    await db.query(
      "SELECT 1 FROM email_outbox WHERE to_email = 'lhamo@example.bt' AND subject LIKE '%approved%'",
    )
  ).rows.length === 1,
);

// ---- invoices, BFS payment, receipt
const inv = await call(
  'POST',
  'invoices',
  {
    customer: { name: 'Pema Choden', email: 'pema@example.bt', mobile: '+97516000111' },
    items: [
      { d: 'Scarf', q: 2, p: 1000, disc: { kind: 'pct', v: 10 } },
      { d: 'Belt', q: 1, p: 500, disc: { kind: 'none', v: 0 } },
    ],
    charges: [
      { kind: 'Delivery', mode: 'amt', v: 100 },
      { kind: 'Tax', mode: 'pct', v: 5 },
    ],
    notes: '',
  },
  newbie,
);
// items: 2x1000 -10% = 1800 ; +500 = 2300 ; delivery 100 ; tax 5% of 2300 = 115 -> 2515
ok(
  'invoice total calculated on the server',
  inv.status === 200 && inv.data.total === 251500,
  inv.data,
);
ok(
  'other charge needs a label',
  (
    await call(
      'POST',
      'invoices',
      { items: [{ d: 'x', q: 1, p: 10 }], charges: [{ kind: 'Other', mode: 'amt', v: 5 }] },
      newbie,
    )
  ).status === 400,
);
ok(
  'invoice send needs a valid email',
  (await call('POST', `invoices/${inv.data.id}/action`, { action: 'send', to: 'bad' }, newbie))
    .status === 400,
);
ok(
  'invoice sent',
  (
    await call(
      'POST',
      `invoices/${inv.data.id}/action`,
      { action: 'send', to: 'pema@example.bt' },
      newbie,
    )
  ).status === 200,
);
const start = await call('POST', 'public/pay/start', { token: inv.data.token }, '');
ok(
  'customer starts payment, AR built',
  start.status === 200 &&
    start.data.ar.bfs_benfId === 'BE00000777' &&
    start.data.ar.bfs_txnAmount === '2515.00',
  start.data,
);
const ar = start.data.ar;
const ac: any = {
  bfs_msgType: 'AC',
  bfs_bfsTxnId: '620100123456',
  bfs_bfsTxnTime: '20261027120000',
  bfs_benfTxnTime: ar.bfs_benfTxnTime,
  bfs_orderNo: ar.bfs_orderNo,
  bfs_benfId: ar.bfs_benfId,
  bfs_txnCurrency: 'BTN',
  bfs_txnAmount: ar.bfs_txnAmount,
  bfs_remitterName: 'Pema Choden',
  bfs_remitterBankId: 'BOBL',
  bfs_debitAuthCode: '00',
  bfs_debitAuthNo: '9000000001',
};
const forged = { ...ac, bfs_txnAmount: '1.00' };
forged.bfs_checkSum = await bfsSign(ac);
const fr = await call('POST', 'public/pay/complete', { ac: forged }, '');
ok(
  'tampered amount is rejected and recorded as failed',
  fr.data.status === 'Failed' && fr.data.checks.amt === false,
  fr.data,
);
const ac2 = { ...ac, bfs_bfsTxnId: '620100123457' };
(ac2 as any).bfs_checkSum = await bfsSign(ac2);
const done = await call('POST', 'public/pay/complete', { ac: ac2 }, '');
ok('genuine payment recorded', done.data.status === 'Successful', done.data);
ok(
  'same payment is not recorded twice',
  (await call('POST', 'public/pay/complete', { ac: ac2 }, '')).data.duplicate === true,
);
ok(
  'exactly one successful transaction for the order',
  (
    await db.query(
      "SELECT count(*)::int AS n FROM transactions WHERE order_no = $1 AND status = 'Successful'",
      [ar.bfs_orderNo],
    )
  ).rows[0].n === 1,
);
ok('invoice is paid', (await call('GET', 'invoices', undefined, newbie)).data[0].status === 'Paid');
const rc = await call(
  'GET',
  `public/receipt/${done.data.txnId}?t=${inv.data.token}`,
  undefined,
  '',
);
ok(
  'customer downloads receipt PDF',
  rc.status === 200 && Buffer.isBuffer(rc.data) && rc.data.subarray(0, 4).toString() === '%PDF',
  rc.status,
);
ok(
  'receipt link with wrong token is refused',
  (await call('GET', `public/receipt/${done.data.txnId}?t=nope`, undefined, '')).status === 404,
);
ok(
  'receipt is stored in the system',
  (await db.query('SELECT 1 FROM receipts WHERE txn_id = $1', [done.data.txnId])).rows.length === 1,
);
ok(
  'merchant sees customer name on the transaction',
  (await call('GET', 'transactions', undefined, newbie)).data.some(
    (t: any) => t.customer === 'Pema Choden',
  ),
);
ok(
  'payment notification created',
  (await call('GET', 'notifications?q=received', undefined, newbie)).data.length >= 1,
);

// ---- team: merchant sets the password, member must change it
const t1 = await call(
  'POST',
  'team',
  {
    name: 'Tashi Wangmo',
    email: 'tashi@lhamoweaves.bt',
    mobile: '+97577555111',
    password: 'Temp@12345',
    roleCode: 'MERCHANT_FINANCE',
  },
  newbie,
);
ok('owner adds a member with a temporary password', t1.status === 200, t1.data);
ok(
  'Basic plan seat limit is enforced',
  (
    await call(
      'POST',
      'team',
      {
        name: 'Third Person',
        email: 'third@lhamoweaves.bt',
        password: 'Temp@12345',
        roleCode: 'MERCHANT_SUPPORT',
      },
      newbie,
    )
  ).status === 409,
);
const tashi = await call(
  'POST',
  'auth/login',
  { email: 'tashi@lhamoweaves.bt', password: 'Temp@12345' },
  '',
);
ok(
  'member is told to change the password',
  tashi.data.mustChange === true && tashi.data.home === '/change-password',
  tashi.data,
);
ok(
  'everything else is blocked until then',
  (await call('GET', 'invoices', undefined, tashi.cookie)).data.code === 'MUST_CHANGE',
);
ok(
  'weak new password refused',
  (await call('POST', 'auth/password', { current: 'Temp@12345', next: 'short' }, tashi.cookie))
    .status === 400,
);
ok(
  'member sets own password',
  (await call('POST', 'auth/password', { current: 'Temp@12345', next: 'Mine@54321' }, tashi.cookie))
    .status === 200,
);
ok(
  'member now has finance access only',
  (await call('GET', 'invoices', undefined, tashi.cookie)).status === 200 &&
    (await call('GET', 'team', undefined, tashi.cookie)).status === 403,
);
ok(
  'last owner cannot be demoted',
  (
    await call(
      'PATCH',
      `team/${(await call('GET', 'team', undefined, newbie)).data.members.find((m: any) => m.me).id}`,
      { roleCode: 'MERCHANT_FINANCE' },
      newbie,
    )
  ).status === 409,
);
const role = await call(
  'POST',
  'roles',
  { name: 'Sales', perms: ['invoice.view', 'payment.view', 'report.export'] },
  owner,
);
ok('custom role created', role.status === 200, role.data);
ok(
  'custom role cannot manage the team',
  (await call('POST', 'roles', { name: 'Boss', perms: ['team.manage'] }, owner)).status === 400,
);

// ---- API keys
ok(
  'live key refused before approval is not an issue for approved merchant',
  (await call('POST', 'keys', { mode: 'live' }, owner)).data.key?.startsWith('gp_live_'),
);
ok(
  'test key returned once',
  (await call('POST', 'keys', { mode: 'test' }, dev)).data.key?.startsWith('gp_test_'),
);
ok(
  'only hashes are stored',
  (await db.query("SELECT count(*)::int AS n FROM api_keys WHERE key_hash LIKE 'gp_%'")).rows[0]
    .n === 0,
);

// ---- subscriptions
const run1 = await call('POST', 'admin/reminders/run', undefined, admin);
ok(
  '3-day reminder sent to the merchant',
  run1.data.reminded === 1 &&
    (
      await db.query(
        "SELECT 1 FROM email_outbox WHERE kind = 'reminder' AND to_email = 'owner@druktrails.bt'",
      )
    ).rows.length >= 1,
  run1.data,
);
ok(
  'reminder is not sent twice',
  (await call('POST', 'admin/reminders/run', undefined, admin)).data.reminded === 0,
);
const s1 = await call('POST', 'subscription/start', { plan: 'Gold' }, owner);
ok(
  'subscription uses a separate beneficiary',
  s1.data.ar.bfs_benfId === 'BE00000001' && s1.data.ar.bfs_txnAmount === '1500.00',
  s1.data,
);
const sac: any = {
  bfs_msgType: 'AC',
  bfs_bfsTxnId: '620100999001',
  bfs_bfsTxnTime: '20261027120000',
  bfs_benfTxnTime: s1.data.ar.bfs_benfTxnTime,
  bfs_orderNo: s1.data.ar.bfs_orderNo,
  bfs_benfId: 'BE00000001',
  bfs_txnCurrency: 'BTN',
  bfs_txnAmount: '1500.00',
  bfs_debitAuthCode: '00',
  bfs_debitAuthNo: '9000000009',
};
sac.bfs_checkSum = await bfsSign(sac);
ok(
  'subscription payment extends the plan',
  (await call('POST', 'public/pay/complete', { ac: sac }, '')).data.kind === 'subscription',
);
const after = (await call('GET', 'subscription', undefined, owner)).data;
ok(
  'plan runs another month from the old end date',
  after.daysLeft > 30 && after.payments.length === 2,
  after,
);
ok(
  'merchant cannot manage other merchants subscriptions',
  (await call('GET', 'admin/subscriptions', undefined, owner)).status === 403,
);
ok(
  'admin can extend a subscription',
  (
    await call(
      'POST',
      `admin/subscriptions/22222222-2222-2222-2222-222222222222/action`,
      { action: 'waive', plan: 'Gold' },
      admin,
    )
  ).status === 200,
);

// ---- support and feedback
ok(
  'finance cannot raise support requests',
  (await call('POST', 'tickets', { kind: 'support', subject: 'x', body: 'y' }, finance)).status ===
    403,
);
const tk = await call(
  'POST',
  'tickets',
  { kind: 'support', subject: 'Refund help', category: 'Refund', body: 'Please help' },
  support,
);
ok('support role raises a request', tk.status === 200, tk.data);
ok(
  'operator sees it with merchant details',
  (await call('GET', 'tickets', undefined, operator)).data.find((t: any) => t.no === tk.data.no)
    ?.biz === 'Druk Trails Pvt Ltd',
);
const rep = await call(
  'POST',
  `tickets/${tk.data.no}/messages`,
  { body: 'We will refund today.' },
  operator,
);
ok(
  'operator reply is emailed',
  rep.data.emailedTo === 'sonam@druktrails.bt' &&
    (
      await db.query(
        "SELECT 1 FROM email_outbox WHERE kind = 'support' AND to_email = 'sonam@druktrails.bt'",
      )
    ).rows.length === 1,
  rep.data,
);
const fb = await call(
  'POST',
  'tickets',
  { kind: 'feedback', subject: 'Nice portal', body: 'Easy to use' },
  finance,
);
ok('any signed-in user can send feedback', fb.status === 200, fb.data);
ok(
  'feedback goes to admin, not operator',
  (await call('GET', 'tickets', undefined, admin)).data.some((t: any) => t.no === fb.data.no) &&
    !(await call('GET', 'tickets', undefined, operator)).data.some((t: any) => t.no === fb.data.no),
);
ok(
  'operator cannot reply to feedback',
  (await call('POST', `tickets/${fb.data.no}/messages`, { body: 'hi' }, operator)).status === 404,
);

// ---- staff accounts
const emp = await call(
  'POST',
  'admin/employees',
  {
    name: 'Choki Zangmo',
    email: 'choki@globalpay.bt',
    mobile: '+97516909090',
    password: 'Temp@12345',
    roleCode: 'OPERATOR',
  },
  admin,
);
ok('admin creates an operator', emp.status === 200, emp.data);
ok(
  'admin cannot deactivate themselves',
  (
    await call(
      'PATCH',
      `admin/employees/${(await db.query("SELECT id FROM users WHERE email='admin@globalpay.bt'")).rows[0].id}`,
      { status: 'deactivated' },
      admin,
    )
  ).status === 409,
);
ok(
  'audit trail exists',
  (await call('GET', 'admin/audit?q=invoice', undefined, admin)).data.length > 0,
);
ok(
  'document list for admin',
  (await call('GET', 'admin/documents', undefined, admin)).data.length > 10,
);
ok(
  'notification date filter works',
  (await call('GET', 'notifications?from=2999-01-01', undefined, owner)).data.length === 0,
);

console.log(`\n${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);

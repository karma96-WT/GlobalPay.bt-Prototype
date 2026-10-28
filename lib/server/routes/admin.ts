import { query, tx } from '../db';
import { route, bad, HttpError } from '../registry';
import { audit, notify } from '../util';
import { hashPassword } from '../auth';
import { EMAIL_RE, MOBILE_RE, passwordProblems } from '../../validation';
import { txnJson } from './invoices';

route('GET', 'admin/overview', { scope: 'platform' }, async () => {
  const [r] = await query(
    `SELECT
    (SELECT count(*)::int FROM merchants) AS merchants,
    (SELECT count(*)::int FROM applications WHERE status IN ('Pending','Correction required','Waiting')) AS open_apps,
    (SELECT count(*)::int FROM support_tickets WHERE kind = 'support' AND status <> 'Resolved') AS open_support,
    (SELECT count(*)::int FROM support_tickets WHERE kind = 'feedback' AND status <> 'Resolved') AS open_feedback,
    (SELECT count(*)::int FROM subscriptions WHERE plan <> 'Basic' AND status = 'Active' AND period_end - CURRENT_DATE <= 3) AS expiring,
    (SELECT count(*)::int FROM users WHERE scope_staff) AS staff,
    (SELECT COALESCE(sum(amount_minor), 0)::bigint FROM transactions WHERE kind = 'invoice' AND status = 'Successful' AND occurred_at >= date_trunc('month', now())) AS volume,
    (SELECT count(*)::int FROM transactions WHERE status = 'Successful') AS paid`.replace(
      'scope_staff',
      "role_code IN ('ADMIN','OPERATOR') AND status = 'active'",
    ),
  );
  return r;
});

route('GET', 'admin/merchants', { perm: ['merchant.view'] }, async () => {
  const rows = await query(
    `SELECT m.*, s.plan AS sub_plan, s.status AS sub_status, s.period_end,
            o.full_name AS owner_name, o.email AS owner_email,
            (SELECT count(*)::int FROM users u WHERE u.merchant_id = m.id AND u.status = 'active') AS members,
            (SELECT COALESCE(sum(amount_minor), 0)::bigint FROM transactions t WHERE t.merchant_id = m.id AND t.kind = 'invoice' AND t.status = 'Successful') AS volume,
            (SELECT string_agg(a.provider || ':' || a.status, ', ') FROM applications a WHERE a.merchant_id = m.id) AS apps
       FROM merchants m LEFT JOIN subscriptions s ON s.merchant_id = m.id
       LEFT JOIN LATERAL (SELECT full_name, email FROM users u WHERE u.merchant_id = m.id AND u.role_code = 'MERCHANT_OWNER' ORDER BY created_at LIMIT 1) o ON true
      ORDER BY m.created_at DESC`,
  );
  return rows.map((m) => ({
    id: m.id,
    name: m.legal_name,
    type: m.business_type,
    license: m.license_no,
    plan: m.plan,
    subStatus: m.sub_status,
    periodEnd: m.period_end,
    status: m.status,
    owner: m.owner_name,
    ownerEmail: m.owner_email,
    phone: m.phone,
    email: m.email,
    members: m.members,
    volume: m.volume,
    apps: m.apps || '',
    createdAt: m.created_at,
  }));
});

route('GET', 'admin/transactions', { perm: ['transaction.view'] }, async () => {
  const rows = await query(
    `SELECT t.*, m.legal_name, i.invoice_no FROM transactions t JOIN merchants m ON m.id = t.merchant_id LEFT JOIN invoices i ON i.id = t.invoice_id ORDER BY t.occurred_at DESC LIMIT 1000`,
  );
  return rows.map(txnJson);
});

route('GET', 'admin/documents', { perm: ['document.view'] }, async () => {
  const rows = await query(
    `SELECT d.*, a.provider, a.status AS app_status, m.legal_name FROM application_documents d
       JOIN applications a ON a.id = d.application_id JOIN merchants m ON m.id = a.merchant_id ORDER BY d.uploaded_at DESC, d.application_id, d.position`,
  );
  return rows.map((d) => ({
    appId: d.application_id,
    doc: d.doc_name,
    merchant: d.legal_name,
    prov: d.provider,
    appStatus: d.app_status,
    state: d.state,
    file: d.file_name,
    size: d.file_size,
    at: d.uploaded_at,
    note: d.note,
    demo: !d.file_name,
  }));
});

// ---------- staff accounts ----------
route('GET', 'admin/employees', { perm: ['employee.manage'] }, async () => {
  const rows = await query(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.role_code, u.status, u.must_change_password, u.last_login_at FROM users u JOIN roles r ON r.code = u.role_code WHERE r.scope = 'platform' ORDER BY u.created_at`,
  );
  const [{ n }] = await query(
    "SELECT count(*)::int AS n FROM applications WHERE status IN ('Pending','Correction required')",
  );
  return {
    open: n,
    staff: rows.map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      mobile: u.mobile,
      roleCode: u.role_code,
      status: u.status,
      mustChange: u.must_change_password,
      lastLogin: u.last_login_at,
    })),
  };
});
route('POST', 'admin/employees', { perm: ['employee.manage'] }, async (c) => {
  const b = await c.json();
  const name = String(b.name || '').trim();
  const mobile = String(b.mobile || '').replace(/\s/g, '');
  if (name.length < 2) throw bad("Enter the employee's full name");
  if (!EMAIL_RE.test(String(b.email || ''))) throw bad('Enter a valid email address');
  if (!MOBILE_RE.test(mobile))
    throw bad('Mobile must be +975 followed by 17, 16 or 77 and six more digits');
  if (!['ADMIN', 'OPERATOR'].includes(b.roleCode)) throw bad('Choose Admin or Operator');
  const problems = passwordProblems(String(b.password || ''));
  if (problems.length) throw bad('Temporary password: ' + problems[0].toLowerCase());
  if (
    (
      await query('SELECT 1 FROM users WHERE lower(email) = lower($1) OR mobile = $2', [
        b.email,
        mobile,
      ])
    ).length
  )
    throw new HttpError(409, 'An account with this email or mobile already exists');
  const [u] = await query(
    `INSERT INTO users (email, mobile, full_name, password_hash, role_code, onboarding_stage, must_change_password, created_by) VALUES ($1,$2,$3,$4,$5,'merchant',true,$6) RETURNING id`,
    [b.email.trim(), mobile, name, await hashPassword(b.password), b.roleCode, c.user.id],
  );
  await audit(c.user.id, 'employee.created', 'user', u.id, { role: b.roleCode }, c.ip);
  return { ok: true };
});
route('PATCH', 'admin/employees/:id', { perm: ['employee.manage'] }, async (c) => {
  const b = await c.json();
  const [u] = await query(
    "SELECT u.* FROM users u JOIN roles r ON r.code = u.role_code WHERE u.id = $1 AND r.scope = 'platform'",
    [c.p.id],
  );
  if (!u) throw new HttpError(404, 'Employee not found');
  const lastAdmin = async () =>
    (
      await query(
        "SELECT count(*)::int AS n FROM users WHERE role_code = 'ADMIN' AND status = 'active'",
      )
    )[0].n <= 1 &&
    u.role_code === 'ADMIN' &&
    u.status === 'active';
  if (b.roleCode && b.roleCode !== u.role_code) {
    if (!['ADMIN', 'OPERATOR'].includes(b.roleCode)) throw bad('Choose Admin or Operator');
    if (await lastAdmin()) throw new HttpError(409, 'There must be at least one active Admin');
    await query('UPDATE users SET role_code = $2 WHERE id = $1', [u.id, b.roleCode]);
  }
  if (b.status && b.status !== u.status) {
    if (u.id === c.user.id) throw new HttpError(409, 'You cannot deactivate your own account');
    if (b.status === 'deactivated' && (await lastAdmin()))
      throw new HttpError(409, 'There must be at least one active Admin');
    await query('UPDATE users SET status = $2 WHERE id = $1', [u.id, b.status]);
    if (b.status === 'deactivated') await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
  }
  if (b.password) {
    const problems = passwordProblems(String(b.password));
    if (problems.length) throw bad('Temporary password: ' + problems[0].toLowerCase());
    await query('UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1', [
      u.id,
      await hashPassword(b.password),
    ]);
    await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
  }
  await audit(
    c.user.id,
    'employee.updated',
    'user',
    u.id,
    { roleCode: b.roleCode, status: b.status, reset: !!b.password },
    c.ip,
  );
  return { ok: true };
});

route('GET', 'admin/roles', { perm: ['employee.manage', 'settings.manage'] }, async () =>
  (
    await query(
      'SELECT code, scope, name, description, perms, is_system, merchant_id FROM roles ORDER BY scope, is_system DESC, name',
    )
  ).map((r) => ({
    code: r.code,
    scope: r.scope,
    name: r.name,
    desc: r.description,
    perms: r.perms,
    system: r.is_system,
    custom: !!r.merchant_id,
  })),
);

route('GET', 'admin/audit', { perm: ['audit.view'] }, async (c) => {
  const q = c.url.searchParams.get('q');
  const rows = await query(
    `SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.ip, a.detail, u.full_name, u.email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR a.action ILIKE $1 OR a.entity_id ILIKE $1 OR u.email ILIKE $1) ORDER BY a.id DESC LIMIT 300`,
    [q ? '%' + q + '%' : null],
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    ip: r.ip,
    detail: r.detail,
    user: r.full_name || 'System',
    email: r.email,
  }));
});
route(
  'GET',
  'admin/outbox',
  { perm: ['audit.view', 'settings.manage'] },
  async () =>
    await query(
      'SELECT id, to_email, subject, kind, status, error, created_at, body FROM email_outbox ORDER BY created_at DESC LIMIT 200',
    ),
);

route('GET', 'admin/settings', { perm: ['settings.manage'] }, async () => {
  const rows = await query('SELECT key, value FROM platform_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});
route('PUT', 'admin/settings', { perm: ['settings.manage'] }, async (c) => {
  const b = await c.json();
  for (const key of ['contacts', 'plans', 'platform_beneficiary'])
    if (b[key])
      await query(
        'INSERT INTO platform_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()',
        [key, JSON.stringify(b[key])],
      );
  await audit(c.user.id, 'settings.updated', 'platform', undefined, { keys: Object.keys(b) }, c.ip);
  return { ok: true };
});

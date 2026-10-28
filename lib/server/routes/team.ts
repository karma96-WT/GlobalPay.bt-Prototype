import { query, tx } from '../db';
import { route, bad, HttpError, Ctx, mid } from '../registry';
import { notify, audit, queueEmail } from '../util';
import { hashPassword, randomToken, sha256 } from '../auth';
import { EMAIL_RE, MOBILE_RE, passwordProblems } from '../../validation';
import { MERCHANT_PERMS, PLAN_SEATS } from '../../rbac';

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);

async function rolesFor(merchantId: string) {
  const r = await query(
    "SELECT code, name, description, perms, is_system FROM roles WHERE scope = 'merchant' AND (merchant_id IS NULL OR merchant_id = $1) ORDER BY is_system DESC, name",
    [merchantId],
  );
  return r.map((x) => ({
    code: x.code,
    name: x.name,
    desc: x.description,
    perms: x.perms,
    system: x.is_system,
  }));
}
const ownerCount = async (m: string) =>
  (
    await query(
      "SELECT count(*)::int AS n FROM users WHERE merchant_id = $1 AND role_code = 'MERCHANT_OWNER' AND status = 'active'",
      [m],
    )
  )[0].n;

route('GET', 'team', { scope: 'merchant', perm: ['team.manage'] }, async (c) => {
  const m = mid(c);
  const [biz] = await query('SELECT plan FROM merchants WHERE id = $1', [m]);
  const members = await query(
    'SELECT id, full_name, email, mobile, role_code, status, must_change_password, last_login_at FROM users WHERE merchant_id = $1 ORDER BY created_at',
    [m],
  );
  const limit = PLAN_SEATS[biz.plan];
  return {
    plan: biz.plan,
    limit: limit === Infinity ? null : limit,
    used: members.filter((u) => u.status === 'active').length,
    members: members.map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      mobile: u.mobile,
      roleCode: u.role_code,
      status: u.status,
      mustChange: u.must_change_password,
      lastLogin: u.last_login_at,
      me: u.id === c.user.id,
    })),
    roles: await rolesFor(m),
  };
});

route('POST', 'team', { scope: 'merchant', perm: ['team.manage'] }, async (c) => {
  const m = mid(c);
  const b = await c.json();
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const mobile = String(b.mobile || '').replace(/\s/g, '');
  if (name.length < 2) throw bad("Enter the member's full name");
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email address');
  if (mobile && !MOBILE_RE.test(mobile))
    throw bad('Mobile must be +975 followed by 17, 16 or 77 and six more digits');
  const problems = passwordProblems(String(b.password || ''));
  if (problems.length) throw bad('Temporary password: ' + problems[0].toLowerCase());
  const role = (await rolesFor(m)).find((r) => r.code === b.roleCode);
  if (!role) throw bad('Choose a role');
  const [biz] = await query('SELECT plan, legal_name FROM merchants WHERE id = $1', [m]);
  const limit = PLAN_SEATS[biz.plan];
  const [{ n }] = await query(
    "SELECT count(*)::int AS n FROM users WHERE merchant_id = $1 AND status = 'active'",
    [m],
  );
  if (n >= limit)
    throw new HttpError(
      409,
      `Your ${biz.plan} plan includes ${limit} team seats and all are in use. Upgrade your plan to add more.`,
    );
  if ((await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length)
    throw new HttpError(409, 'An account with this email already exists');
  if (mobile && (await query('SELECT 1 FROM users WHERE mobile = $1', [mobile])).length)
    throw new HttpError(409, 'An account with this mobile number already exists');
  await tx(async (q) => {
    const [u] = await q(
      `INSERT INTO users (email, mobile, full_name, password_hash, role_code, merchant_id, onboarding_stage, must_change_password, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'merchant',true,$7) RETURNING id`,
      [email, mobile || null, name, await hashPassword(b.password), role.code, m, c.user.id],
    );
    await queueEmail(
      email,
      `You have been added to ${biz.legal_name} on GlobalPay.bt`,
      `Hello ${name},\n\n${c.user.name} added you to ${biz.legal_name} on GlobalPay.bt as ${role.name}.\n\nSign in with your email address and the temporary password ${c.user.name} gave you. You will be asked to choose your own password the first time you sign in.`,
      'welcome',
      q,
    );
    await notify(
      'merchant',
      'Team',
      'Team member added',
      `${name} (${email}) was added as ${role.name}.`,
      m,
      q,
    );
    await audit(c.user.id, 'team.member_added', 'user', u.id, { email, role: role.code }, c.ip, q);
  });
  return { ok: true };
});

async function member(c: Ctx) {
  const [u] = await query('SELECT * FROM users WHERE id = $1 AND merchant_id = $2', [
    c.p.id,
    c.user.merchantId,
  ]);
  if (!u) throw new HttpError(404, 'Team member not found');
  return u;
}
route('PATCH', 'team/:id', { scope: 'merchant', perm: ['team.manage'] }, async (c) => {
  const u = await member(c);
  const b = await c.json();
  const m = mid(c);
  if (b.roleCode && b.roleCode !== u.role_code) {
    if (!(await rolesFor(m)).some((r) => r.code === b.roleCode)) throw bad('Choose a role');
    if (u.role_code === 'MERCHANT_OWNER' && (await ownerCount(m)) <= 1)
      throw new HttpError(409, 'A business needs at least one Owner');
    await query('UPDATE users SET role_code = $2 WHERE id = $1', [u.id, b.roleCode]);
    await notify(
      'merchant',
      'Team',
      'Role changed',
      `${u.full_name} is now ${b.roleCode.replace('MERCHANT_', '').toLowerCase()}.`,
      m,
    );
    await audit(c.user.id, 'team.role_changed', 'user', u.id, { to: b.roleCode }, c.ip);
  }
  if (b.status && b.status !== u.status) {
    if (!['active', 'deactivated'].includes(b.status)) throw bad('Unknown status');
    if (u.id === c.user.id) throw new HttpError(409, 'You cannot deactivate your own account');
    if (
      b.status === 'deactivated' &&
      u.role_code === 'MERCHANT_OWNER' &&
      (await ownerCount(m)) <= 1
    )
      throw new HttpError(409, 'A business needs at least one Owner');
    if (b.status === 'active') {
      const [biz] = await query('SELECT plan FROM merchants WHERE id = $1', [m]);
      const [{ n }] = await query(
        "SELECT count(*)::int AS n FROM users WHERE merchant_id = $1 AND status = 'active'",
        [m],
      );
      if (n >= PLAN_SEATS[biz.plan]) throw new HttpError(409, 'All team seats are in use');
    }
    await query('UPDATE users SET status = $2 WHERE id = $1', [u.id, b.status]);
    if (b.status === 'deactivated') await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    await notify(
      'merchant',
      'Team',
      b.status === 'active' ? 'Member reactivated' : 'Member removed',
      `${u.full_name} ${b.status === 'active' ? 'can sign in again' : 'no longer has access'}.`,
      m,
    );
    await audit(c.user.id, 'team.status_changed', 'user', u.id, { to: b.status }, c.ip);
  }
  if (b.password) {
    const problems = passwordProblems(String(b.password));
    if (problems.length) throw bad('Temporary password: ' + problems[0].toLowerCase());
    await query('UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1', [
      u.id,
      await hashPassword(b.password),
    ]);
    await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    await audit(c.user.id, 'team.password_reset', 'user', u.id, null, c.ip);
  }
  return { ok: true };
});

route('POST', 'roles', { scope: 'merchant', perm: ['team.manage'] }, async (c) => {
  const m = mid(c);
  const b = await c.json();
  const name = String(b.name || '').trim();
  const allowed = MERCHANT_PERMS.map((p) => p[0]);
  const perms: string[] = (b.perms || []).filter((p: string) => allowed.includes(p));
  if (!name) throw bad('Enter a role name');
  if (!perms.length) throw bad('Choose at least one permission');
  if (perms.includes('team.manage') || perms.includes('plan.manage'))
    throw bad('Only the Owner role can manage the team and plan');
  const code = `CUSTOM_${m.slice(0, 8).toUpperCase()}_${slug(name)}`;
  await query(
    "INSERT INTO roles (code, scope, name, description, perms, merchant_id, is_system) VALUES ($1,'merchant',$2,'Custom role.',$3,$4,false)",
    [code, name, perms, m],
  );
  await notify(
    'merchant',
    'Team',
    'Custom role created',
    `"${name}" can now be assigned to members.`,
    m,
  );
  await audit(c.user.id, 'role.created', 'role', code, { perms }, c.ip);
  return { ok: true, code };
});
route('DELETE', 'roles/:code', { scope: 'merchant', perm: ['team.manage'] }, async (c) => {
  const [r] = await query(
    'SELECT code FROM roles WHERE code = $1 AND merchant_id = $2 AND NOT is_system',
    [c.p.code, c.user.merchantId],
  );
  if (!r) throw new HttpError(404, 'Role not found');
  if ((await query('SELECT 1 FROM users WHERE role_code = $1', [r.code])).length)
    throw new HttpError(409, 'A member still has this role. Change their role first.');
  await query('DELETE FROM roles WHERE code = $1', [r.code]);
  return { ok: true };
});

// ---------- API keys: a test key and a live key, each shown once ----------
route('GET', 'keys', { scope: 'merchant', perm: ['developer.manage'] }, async (c) => {
  const m = mid(c);
  const rows = await query(
    'SELECT id, mode, key_prefix, created_at FROM api_keys WHERE merchant_id = $1 AND revoked_at IS NULL',
    [m],
  );
  const [live] = await query(
    "SELECT count(*)::int AS n FROM applications WHERE merchant_id = $1 AND status = 'Approved'",
    [m],
  );
  return {
    liveAllowed: live.n > 0,
    keys: rows.map((r) => ({ id: r.id, mode: r.mode, prefix: r.key_prefix, at: r.created_at })),
  };
});
route('POST', 'keys', { scope: 'merchant', perm: ['developer.manage'] }, async (c) => {
  const m = mid(c);
  const { mode } = await c.json();
  if (!['test', 'live'].includes(mode)) throw bad('Choose test or live');
  if (
    mode === 'live' &&
    !(await query("SELECT 1 FROM applications WHERE merchant_id = $1 AND status = 'Approved'", [m]))
      .length
  )
    throw new HttpError(409, 'A live key is available once a provider approves your business');
  const key = `gp_${mode}_${randomToken(16)}`;
  await tx(async (q) => {
    await q(
      'UPDATE api_keys SET revoked_at = now() WHERE merchant_id = $1 AND mode = $2 AND revoked_at IS NULL',
      [m, mode],
    );
    await q(
      'INSERT INTO api_keys (merchant_id, mode, key_prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5)',
      [m, mode, key.slice(0, 12), sha256(key), c.user.id],
    );
    await notify(
      'merchant',
      'Security',
      `${mode === 'live' ? 'Live' : 'Test'} API key rolled`,
      'A new key was created and the old one stopped working.',
      m,
      q,
    );
    await audit(c.user.id, 'apikey.rolled', 'merchant', m, { mode }, c.ip, q);
  });
  return { key }; // the only time the full key is returned
});

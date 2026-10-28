import { query } from '../db';
import { route, bad, HttpError, Ctx } from '../registry';
import {
  hashPassword,
  checkPassword,
  createSession,
  clearCookie,
  tokenFrom,
  sha256,
} from '../auth';
import { audit } from '../util';
import { EMAIL_RE, MOBILE_RE, passwordProblems } from '../../validation';

const json = (b: any, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const homeFor = (u: { scope: string; roleCode: string; stage: string }) =>
  u.scope === 'merchant'
    ? u.stage === 'new'
      ? '/onboarding'
      : '/merchant/dashboard'
    : u.roleCode === 'ADMIN'
      ? '/admin/dashboard'
      : '/operator/dashboard';

route('POST', 'auth/register', { auth: false }, async (c) => {
  const b = await c.json();
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const mobile = String(b.mobile || '').replace(/\s/g, '');
  if (name.length < 2) throw bad('Enter your full name');
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email address');
  if (!MOBILE_RE.test(mobile))
    throw bad('Mobile must be +975 followed by 17, 16 or 77 and six more digits');
  const problems = passwordProblems(String(b.password || ''));
  if (problems.length) throw bad(problems[0]);
  if ((await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length)
    throw new HttpError(409, 'An account with this email already exists');
  if ((await query('SELECT 1 FROM users WHERE mobile = $1', [mobile])).length)
    throw new HttpError(409, 'An account with this mobile number already exists');
  const [u] = await query(
    `INSERT INTO users (email, mobile, full_name, password_hash, role_code, onboarding_stage, email_consent)
     VALUES ($1,$2,$3,$4,'MERCHANT_OWNER','new',$5) RETURNING id`,
    [email, mobile, name, await hashPassword(b.password), !!b.emailConsent],
  );
  await audit(u.id, 'auth.register', 'user', u.id, { emailConsent: !!b.emailConsent }, c.ip);
  const cookie = await createSession(u.id, c.req.headers.get('user-agent') || '', c.ip);
  return json({ ok: true, home: '/onboarding' }, { 'set-cookie': cookie });
});

route('POST', 'auth/login', { auth: false }, async (c) => {
  const b = await c.json();
  const [u] = await query(
    `SELECT u.*, r.scope FROM users u JOIN roles r ON r.code = u.role_code WHERE lower(u.email) = lower($1)`,
    [String(b.email || '').trim()],
  );
  if (!u || !(await checkPassword(String(b.password || ''), u.password_hash))) {
    await audit(u?.id ?? null, 'auth.login_failed', 'user', u?.id, { email: b.email }, c.ip);
    throw new HttpError(401, 'Email or password is not correct');
  }
  if (u.status !== 'active')
    throw new HttpError(403, 'This account has been deactivated. Contact your administrator.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  await audit(u.id, 'auth.login', 'user', u.id, null, c.ip);
  const cookie = await createSession(u.id, c.req.headers.get('user-agent') || '', c.ip);
  const home = u.must_change_password
    ? '/change-password'
    : homeFor({ scope: u.scope, roleCode: u.role_code, stage: u.onboarding_stage });
  return json({ ok: true, home, mustChange: u.must_change_password }, { 'set-cookie': cookie });
});

route('POST', 'auth/logout', { auth: false }, async (c) => {
  const t = tokenFrom(c.req);
  if (t) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(t)]);
  return json({ ok: true }, { 'set-cookie': clearCookie() });
});

route('GET', 'me', { allowMustChange: true }, async (c) => {
  const u = c.user;
  const aud = u.scope === 'merchant' ? 'merchant' : u.roleCode === 'ADMIN' ? 'admin' : 'operator';
  const [n] = await query(
    `SELECT count(*)::int AS n FROM notifications WHERE audience = $1 AND NOT read AND ($1 <> 'merchant' OR merchant_id = $2)`,
    [aud, u.merchantId],
  );
  let sub: any = null;
  if (u.merchantId) {
    [sub] = await query(
      `SELECT s.plan, s.status, s.period_end, (s.period_end - CURRENT_DATE) AS days_left FROM subscriptions s WHERE s.merchant_id = $1`,
      [u.merchantId],
    );
  }
  const [live] = u.merchantId
    ? await query(
        "SELECT count(*)::int AS n FROM applications WHERE merchant_id = $1 AND status = 'Approved'",
        [u.merchantId],
      )
    : [{ n: 0 }];
  const [biz] = u.merchantId
    ? await query('SELECT * FROM merchants WHERE id = $1', [u.merchantId])
    : [null];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    mobile: u.mobile,
    roleCode: u.roleCode,
    roleName: u.roleName,
    scope: u.scope,
    perms: u.perms,
    merchantId: u.merchantId,
    business: u.business,
    stage: u.stage,
    mustChange: u.mustChange,
    emailConsent: u.emailConsent,
    language: u.language,
    unread: n.n,
    home: homeFor(u),
    live: live.n > 0,
    biz: biz && {
      name: biz.legal_name,
      addr: biz.address,
      phone: biz.phone,
      email: biz.email,
      type: biz.business_type,
      website: biz.website,
    },
    subscription: sub && {
      plan: sub.plan,
      status: sub.status,
      periodEnd: sub.period_end,
      daysLeft: sub.days_left,
    },
  };
});

route('POST', 'auth/password', { allowMustChange: true }, async (c) => {
  const b = await c.json();
  const [u] = await query('SELECT password_hash FROM users WHERE id = $1', [c.user.id]);
  if (!(await checkPassword(String(b.current || ''), u.password_hash)))
    throw bad('Your current password is not correct');
  const problems = passwordProblems(String(b.next || ''));
  if (problems.length) throw bad(problems[0]);
  if (b.current === b.next) throw bad('Choose a password different from the current one');
  await query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [
    c.user.id,
    await hashPassword(b.next),
  ]);
  await audit(c.user.id, 'auth.password_changed', 'user', c.user.id, null, c.ip);
  return { ok: true, home: homeFor(c.user) };
});

route('PATCH', 'me', {}, async (c) => {
  const b = await c.json();
  const name = String(b.name ?? c.user.name).trim();
  const mobile = String(b.mobile ?? c.user.mobile).replace(/\s/g, '');
  if (name.length < 2) throw bad('Enter your full name');
  if (!MOBILE_RE.test(mobile))
    throw bad('Mobile must be +975 followed by 17, 16 or 77 and six more digits');
  await query('UPDATE users SET full_name = $2, mobile = $3, email_consent = $4 WHERE id = $1', [
    c.user.id,
    name,
    mobile,
    b.emailConsent ?? c.user.emailConsent,
  ]);
  await audit(c.user.id, 'user.profile_updated', 'user', c.user.id, null, c.ip);
  return { ok: true };
});

route('GET', 'sessions', {}, async (c) => {
  const rows = await query(
    'SELECT id, user_agent, ip, created_at, last_seen_at, token_hash FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC',
    [c.user.id],
  );
  const mine = tokenFrom(c.req);
  return rows.map((r) => ({
    id: r.id,
    device: r.user_agent || 'Unknown device',
    ip: r.ip,
    at: r.last_seen_at || r.created_at,
    current: mine ? sha256(mine) === r.token_hash : false,
  }));
});
route('DELETE', 'sessions/:id', {}, async (c) => {
  await query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [c.p.id, c.user.id]);
  return { ok: true };
});

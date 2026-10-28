import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './db';
import type { User } from './registry';

export const COOKIE = 'gp_session';
const SESSION_DAYS = 7;

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
  (process.env.COOKIE_SECURE === '1' || process.env.VERCEL === '1' ? '; Secure' : '');

/** Create a session row and return the Set-Cookie header value. */
export async function createSession(userId: string, ua = '', ip = '') {
  const token = randomToken();
  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [userId, sha256(token), ua.slice(0, 250), ip, String(SESSION_DAYS)],
  );
  return cookieHeader(token, SESSION_DAYS * 86400);
}
export const clearCookie = () => cookieHeader('', 0);

export const tokenFrom = (req: Request) =>
  (req.headers.get('cookie') || '')
    .split(/;\s*/)
    .find((c) => c.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);

/** The user behind the request's session cookie, with the permissions of their role. */
export async function getUser(req: Request): Promise<User | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const [r] = await query(
    `SELECT u.*, r.name AS role_name, r.scope, r.perms, m.legal_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.code = u.role_code
       LEFT JOIN merchants m ON m.id = u.merchant_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [sha256(token)],
  );
  if (!r) return null;
  query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [sha256(token)]).catch(
    () => {},
  );
  return {
    id: r.id,
    email: r.email,
    name: r.full_name,
    mobile: r.mobile || '',
    roleCode: r.role_code,
    roleName: r.role_name,
    scope: r.scope,
    perms: r.perms,
    merchantId: r.merchant_id,
    business: r.legal_name || '',
    stage: r.onboarding_stage,
    mustChange: r.must_change_password,
    emailConsent: r.email_consent,
    language: r.language,
  };
}

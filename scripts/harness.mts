// Integration test: run the real route handlers against an in-process Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
(globalThis as any).__gpTestDb = db;
const { dispatch } = await import('../lib/server/dispatch.ts');
for (const f of ['01_schema.sql', '02_seed.sql'])
  await db.exec(fs.readFileSync(new URL('../db/', import.meta.url).pathname + f, 'utf8'));

let cookie = '';
const call = async (m: string, path: string, body?: any, ck = cookie, form?: FormData) => {
  const req = new Request('http://t/api/' + path, {
    method: m,
    headers: { cookie: ck, ...(body && !form ? { 'content-type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const res = await dispatch(req, path.split('?')[0].split('/'));
  const sc = res.headers.get('set-cookie');
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, cookie: sc ? sc.split(';')[0] : '' };
};
export const counts = { pass: 0, fail: 0 };
const ok = (name: string, cond: boolean, extra: any = '') => {
  cond ? counts.pass++ : counts.fail++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name, cond ? '' : JSON.stringify(extra));
};
const login = async (e: string, p = 'Demo@12345') =>
  (await call('POST', 'auth/login', { email: e, password: p }, '')).cookie;

export { call, ok, login, db };

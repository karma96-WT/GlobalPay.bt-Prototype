import { getUser } from './auth';
import { routes, HttpError, Ctx } from './registry';
import './routes/auth';
import './routes/onboarding';
import './routes/apps';
import './routes/invoices';
import './routes/team';
import './routes/billing';
import './routes/comms';
import './routes/admin';

const json = (body: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** Match the request to a route, check sign-in and permissions, run the handler. */
export async function dispatch(req: Request, path: string[]) {
  try {
    const parts = path.map(decodeURIComponent);
    for (const r of routes) {
      if (r.m !== req.method || r.parts.length !== parts.length) continue;
      const p: Record<string, string> = {};
      if (
        !r.parts.every((s, i) =>
          s.startsWith(':') ? ((p[s.slice(1)] = parts[i]), true) : s === parts[i],
        )
      )
        continue;

      const user = r.o.auth === false ? null : await getUser(req);
      if (r.o.auth !== false) {
        if (!user) throw new HttpError(401, 'Please sign in');
        if (user.mustChange && !r.o.allowMustChange)
          throw new HttpError(403, 'Change your temporary password first', 'MUST_CHANGE');
        if (r.o.scope && user.scope !== r.o.scope)
          throw new HttpError(403, 'This is not available to your account');
        if (r.o.perm && !r.o.perm.some((x) => user.perms.includes(x)))
          throw new HttpError(403, 'Your role does not allow this');
      }
      const url = new URL(req.url);
      const ctx: Ctx = {
        req,
        user: user as any,
        p,
        url,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
        json: async () => {
          try {
            return await req.json();
          } catch {
            throw new HttpError(400, 'Invalid request');
          }
        },
        form: () => req.formData(),
      };
      const out = await r.fn(ctx);
      return out instanceof Response ? out : json(out ?? { ok: true });
    }
    throw new HttpError(404, 'Not found');
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    if (e?.code === '23505') return json({ error: 'That value is already in use' }, 409);
    if (e?.code === '23514' || e?.code === '23502')
      return json({ error: 'Some details are not valid' }, 400);
    console.error(e);
    return json({ error: 'Something went wrong on the server' }, 500);
  }
}

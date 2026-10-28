export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export type User = {
  id: string;
  email: string;
  name: string;
  mobile: string;
  roleCode: string;
  roleName: string;
  scope: 'platform' | 'merchant';
  perms: string[];
  merchantId: string | null;
  business: string;
  stage: 'new' | 'applied' | 'merchant';
  mustChange: boolean;
  emailConsent: boolean;
  language: string;
};
export type Ctx = {
  req: Request;
  user: User;
  p: Record<string, string>;
  url: URL;
  ip: string;
  json: () => Promise<any>;
  form: () => Promise<FormData>;
};
export type Opts = {
  auth?: boolean; // default true
  perm?: string[]; // the user needs ANY of these permissions
  scope?: 'merchant' | 'platform';
  allowMustChange?: boolean; // reachable while a password change is pending
};
type Handler = (c: Ctx) => Promise<any>;
export const routes: { m: string; parts: string[]; o: Opts; fn: Handler }[] = [];

export const route = (m: string, path: string, o: Opts, fn: Handler) =>
  routes.push({ m, parts: path.split('/'), o, fn });

/** The signed-in person's business id; throws if they have none yet. */
export const mid = (c: Ctx) => {
  if (!c.user.merchantId) throw new HttpError(403, 'Register your business first');
  return c.user.merchantId;
};
export const bad = (msg: string) => new HttpError(400, msg);

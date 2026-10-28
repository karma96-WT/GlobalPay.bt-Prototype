import { dispatch } from '@/lib/server/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { path: string[] } };
const handle = (req: Request, ctx: Ctx) => dispatch(req, ctx.params.path);

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };

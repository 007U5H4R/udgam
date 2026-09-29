import { appAuth } from '../../../_auth/auth';

// Better Auth's HTTP endpoints (technical-plan §3.2). Public by design: sign-up is disabled in the
// config, and role/orgId are never accepted from a client.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = (req: Request): Promise<Response> => appAuth().handler(req);

export const GET = handle;
export const POST = handle;

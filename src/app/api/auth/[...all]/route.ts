import { appAuth } from '../../../_auth/auth';

// Better Auth's HTTP endpoints (technical-plan §3.2). Public by design: sign-up is disabled in the
// config, and role/orgId are never accepted from a client.
//
// Only what the app uses is exposed (TASK-20 fix round 1, review major 3). Sign-in and sign-out run as
// Server Actions that call Better Auth in-process, where sign-in is throttled per email and address
// (src/lib/auth/sign-in-limit.ts); an open `POST /api/auth/sign-in/email` would be a side door around
// that throttle. So every Better Auth path answers 404 except reading the session and signing out.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = '/api/auth/';
/** The Better Auth endpoints reachable over HTTP, per method. */
const ALLOWED: Record<'GET' | 'POST', ReadonlySet<string>> = {
  GET: new Set(['get-session']),
  POST: new Set(['sign-out']),
};

function allowed(method: 'GET' | 'POST', req: Request): boolean {
  const { pathname } = new URL(req.url);
  return pathname.startsWith(BASE) && ALLOWED[method].has(pathname.slice(BASE.length));
}

const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export const GET = (req: Request): Promise<Response> => (allowed('GET', req) ? appAuth().handler(req) : Promise.resolve(notFound()));
export const POST = (req: Request): Promise<Response> => (allowed('POST', req) ? appAuth().handler(req) : Promise.resolve(notFound()));

import { AuthError, authErrorResponse } from '../../../lib/auth/guards';
import { getDbReady } from '../../../lib/db/client';
import { ENROL_STATUS, enrolDevice } from '../../../lib/enrolment/enrol';
import { requireSession, type Guarded } from '../../_auth/require';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };

/**
 * The client address for the per-IP limit (10 per hour, §10): the LAST X-Forwarded-For hop, the one the
 * reverse proxy sets or appends. Earlier hops and X-Real-IP are client-controlled and never trusted.
 * Deployment assumption (TKT-27, documented in .env.example): the app port is never published and
 * Caddy, with `trusted_proxies` unset, overwrites X-Forwarded-For with the connecting address. Without
 * the header (the app reached directly) every client shares one bucket.
 */
function clientIp(req: Request): string {
  const hops = req.headers.get('x-forwarded-for')?.split(',') ?? [];
  return hops.at(-1)?.trim() || 'unknown';
}

/**
 * POST /api/enrol (technical-plan §3.2, TSK-05.3): `{ code, publicJwk }` from a signed-in agent's
 * phone. 200 `{ deviceId }`; a refusal answers `{ error: reason }` with 400, 409 or 429 (TC-021).
 */
export async function POST(req: Request): Promise<Response> {
  let agent: Guarded;
  try {
    agent = await requireSession('agent', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const { code, publicJwk } = (typeof body === 'object' && body !== null ? body : {}) as { code?: unknown; publicJwk?: unknown };
  if (typeof code !== 'string' || typeof publicJwk !== 'object' || publicJwk === null) {
    return Response.json({ error: 'bad_request' }, { status: 400, headers: HEADERS });
  }

  const db = await getDbReady();
  const r = await enrolDevice(db, { code, publicJwk, ip: clientIp(req), sessionAgentId: agent.userId });
  if (!r.ok) return Response.json({ error: r.reason }, { status: ENROL_STATUS[r.reason], headers: HEADERS });
  return Response.json({ deviceId: r.deviceId }, { headers: HEADERS });
}

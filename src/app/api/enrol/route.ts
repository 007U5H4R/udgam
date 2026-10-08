import { AuthError, authErrorResponse } from '../../../lib/auth/guards';
import { readBodyWithin } from '../../../lib/capture/read-form';
import { clientIp } from '../../../lib/client-ip';
import { getDbReady } from '../../../lib/db/client';
import { ENROL_MAX_BYTES, ENROL_READ_DEADLINE_MS, ENROL_STATUS, enrolDevice } from '../../../lib/enrolment/enrol';
import { requireSession, type Guarded } from '../../_auth/require';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };

/**
 * POST /api/enrol (technical-plan §3.2, TSK-05.3): `{ code, publicJwk }` from a signed-in agent's
 * phone. 200 `{ deviceId }`; a refusal answers `{ error: reason }` with 400, 409 or 429 (TC-021).
 *
 * The body is bounded as /api/telemetry's is (final branch review finding 2): after the session check,
 * 411 without a numeric Content-Length (a browser's fetch of a string body always declares one), 413
 * when it declares more than ENROL_MAX_BYTES; then the body is read through a reader cancelled as soon
 * as it passes the cap (413), whatever was declared, or at the deadline (400), so it is never buffered
 * whole.
 */
export async function POST(req: Request): Promise<Response> {
  let agent: Guarded;
  try {
    agent = await requireSession('agent', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const raw = req.headers.get('content-length');
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return Response.json({ error: 'length_required' }, { status: 411, headers: HEADERS });
  if (Number(raw.trim()) > ENROL_MAX_BYTES) return Response.json({ error: 'body_too_large' }, { status: 413, headers: HEADERS });
  const read = await readBodyWithin(req, ENROL_READ_DEADLINE_MS, ENROL_MAX_BYTES);
  if (!read.ok) {
    return read.reason === 'too_large'
      ? Response.json({ error: 'body_too_large' }, { status: 413, headers: HEADERS })
      : Response.json({ error: 'bad_request' }, { status: 400, headers: HEADERS });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(await new Blob(read.chunks).arrayBuffer()));
  } catch {
    body = null;
  }
  const { code, publicJwk } = (typeof body === 'object' && body !== null ? body : {}) as { code?: unknown; publicJwk?: unknown };
  if (typeof code !== 'string' || typeof publicJwk !== 'object' || publicJwk === null) {
    return Response.json({ error: 'bad_request' }, { status: 400, headers: HEADERS });
  }

  const db = await getDbReady();
  const r = await enrolDevice(db, { code, publicJwk, ip: clientIp(req.headers), sessionAgentId: agent.userId });
  if (!r.ok) return Response.json({ error: r.reason }, { status: ENROL_STATUS[r.reason], headers: HEADERS });
  return Response.json({ deviceId: r.deviceId }, { headers: HEADERS });
}

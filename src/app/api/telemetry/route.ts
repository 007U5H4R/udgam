import { parseTelemetry, TELEMETRY_MAX_BYTES } from '../../../lib/certificate/telemetry';
import { log } from '../../../lib/log';

// POST /api/telemetry (TSK-16.3): the certificate page's beacon ("viewed", or "proof failed at step X").
// Public, no session. Only {event, step?, batchId} is accepted (400 otherwise), and it is logged without
// the caller's IP address or user agent: the log line carries exactly the three validated members.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const BAD = () => new Response('{"error":"bad_request"}', { status: 400, headers: HEADERS });

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > TELEMETRY_MAX_BYTES) return BAD();
  let body: string;
  try {
    body = await req.text();
  } catch {
    return BAD();
  }
  const event = parseTelemetry(body);
  if (!event) return BAD();
  log.info({ event: event.event, batchId: event.batchId, ...('step' in event ? { step: event.step } : {}) }, 'certificate.telemetry');
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

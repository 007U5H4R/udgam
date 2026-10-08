import { consume } from '../../../lib/rate-limit';
import { readBodyWithin } from '../../../lib/capture/read-form';
import {
  parseTelemetry,
  TELEMETRY_FAILED_IP_LIMIT,
  TELEMETRY_FAILED_QUERY,
  TELEMETRY_IP_LIMIT,
  TELEMETRY_MAX_BYTES,
  TELEMETRY_READ_DEADLINE_MS,
  telemetryFailedIpKey,
  telemetryIpKey,
} from '../../../lib/certificate/telemetry';
import { clientIp } from '../../../lib/client-ip';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';

// POST /api/telemetry (TSK-16.3): the certificate page's beacon ("viewed", or "proof failed at step X").
// Public, no session. Only {event, step?, batchId} is accepted (400 otherwise), and it is logged without
// the caller's IP address or user agent: the log line carries exactly the three validated members.
//
// Bounded before anything is read (TASK-17 fix round 1, as lib/capture/parse.ts checkContentLength):
// 411 without a numeric Content-Length (sendBeacon always declares one), 413 when it declares more than
// 512 bytes; then 429 (Retry-After) past 30 beacons per client address per 10 minutes; then the body is
// read through a reader that is cancelled as soon as it passes 512 bytes (413), whatever was declared,
// so it is never buffered whole. Proof failures arrive at `?e=proof_failed` and count in a bucket of
// their own (30 per 10 minutes), so views from a shared address never crowd them out; that bucket
// carries proof failures only (anything else sent there is 400).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function refuse(status: number, error: string, retryAfterSec?: number): Response {
  const headers: Record<string, string> = { ...HEADERS };
  if (retryAfterSec !== undefined) headers['Retry-After'] = String(retryAfterSec);
  return new Response(JSON.stringify({ error }), { status, headers });
}

export async function POST(req: Request): Promise<Response> {
  const raw = req.headers.get('content-length');
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return refuse(411, 'length_required');
  if (Number(raw.trim()) > TELEMETRY_MAX_BYTES) return refuse(413, 'body_too_large');

  const failedBucket = new URL(req.url).searchParams.get('e') === TELEMETRY_FAILED_QUERY;
  const ip = clientIp(req.headers);
  const [key, limit] = failedBucket ? [telemetryFailedIpKey(ip), TELEMETRY_FAILED_IP_LIMIT] : [telemetryIpKey(ip), TELEMETRY_IP_LIMIT];
  try {
    const r = await consume(await getDbReady(), key, limit.limit, limit.windowSec);
    if (!r.ok) return refuse(429, 'rate_limited', r.retryAfterSec);
  } catch {
    return refuse(503, 'unavailable');
  }

  const read = await readBodyWithin(req, TELEMETRY_READ_DEADLINE_MS, TELEMETRY_MAX_BYTES);
  if (!read.ok) return read.reason === 'too_large' ? refuse(413, 'body_too_large') : refuse(400, 'bad_request');
  const body = new TextDecoder().decode(await new Blob(read.chunks).arrayBuffer());
  const event = parseTelemetry(body);
  if (!event || (failedBucket && event.event !== 'certificate.proof_failed')) return refuse(400, 'bad_request');
  log.info({ event: event.event, batchId: event.batchId, ...('step' in event ? { step: event.step } : {}) }, 'certificate.telemetry');
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

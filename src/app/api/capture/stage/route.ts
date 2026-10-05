import { AuthError, authErrorResponse } from '../../../../lib/auth/guards';
import { BODY_READ_DEADLINE_MS, BUSY_RETRY_AFTER_SEC, MAX_PHOTO_BYTES } from '../../../../lib/capture/limits';
import { consume } from '../../../../lib/capture/rate-limit';
import { readBodyWithin } from '../../../../lib/capture/read-form';
import {
  acquireStageSlot,
  localStagingStore,
  stageAgentKey,
  STAGE_AGENT_LIMIT,
  STAGE_IP_LIMIT,
  stageIpKey,
  stagePhoto,
  stagingDevice,
  sweepStaging,
} from '../../../../lib/capture/staging';
import { clientIp } from '../../../../lib/client-ip';
import { env } from '../../../../lib/config/env';
import { getDbReady, type Db } from '../../../../lib/db/client';
import { log } from '../../../../lib/log';
import { requireSession, type Guarded } from '../../../_auth/require';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
/** The declared photo types a phone camera sends; the bytes must then sniff as that type (staging.ts). */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/heic', 'image/heif']);
const DEVICE_ID = /^DV-[0-9A-HJKMNP-TV-Z]{8}$/;

function refuse(status: number, error: string, retryAfterSec?: number): Response {
  log.info({ reason: error, status }, 'stage.refused');
  const headers: Record<string, string> = { ...NO_STORE };
  if (retryAfterSec !== undefined) headers['Retry-After'] = String(retryAfterSec);
  return Response.json({ error }, { status, headers });
}

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

/**
 * POST /api/capture/stage (technical-plan §3.2, §22 TSK-30.2, TP28): one photo uploaded when the farmer
 * taps "Use this photo", so Submit sends only the signed payload. The body is the raw image
 * (`Content-Type: image/jpeg | image/heic`), not multipart; the phone names itself in `X-Udgam-Device`.
 * Answers 201 `{sha256, expiresAt}`. Before the body is read (TKT-19's order, EXE17): 401/403 without an
 * agent session; 411 without Content-Length; 413 above MAX_PHOTO_BYTES; 415 for a type that is not a
 * photo; 400 without a phone id; 429 (Retry-After) past the per-address or per-agent limit; 403 for a
 * phone that is not this agent's or is revoked; 503 (Retry-After) when this agent's stage slots are
 * busy. Then expired staged photos are swept, the body is read within BODY_READ_DEADLINE_MS (408 past
 * it) and staged: 413 too large, 415 not the declared photo type (AVIF refused), 429 `too_many` (12
 * unexpired per agent). Nothing is anchored and nothing counts as seen until a capture commits.
 */
export async function POST(req: Request): Promise<Response> {
  let agent: Guarded;
  try {
    agent = await requireSession('agent', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const rawLength = req.headers.get('content-length');
  if (rawLength === null || !/^\d{1,15}$/.test(rawLength.trim())) return refuse(411, 'length_required');
  if (Number(rawLength.trim()) > MAX_PHOTO_BYTES) return refuse(413, 'too_large');
  const mime = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!PHOTO_TYPES.has(mime)) return refuse(415, 'bad_type');
  const deviceId = req.headers.get('x-udgam-device') ?? '';
  if (!DEVICE_ID.test(deviceId)) return refuse(400, 'bad_device');

  let db: Db;
  try {
    db = await getDbReady();
    const perIp = await consume(db, stageIpKey(clientIp(req.headers)), STAGE_IP_LIMIT.limit, STAGE_IP_LIMIT.windowSec);
    if (!perIp.ok) return refuse(429, 'rate_limited', perIp.retryAfterSec);
    const perAgent = await consume(db, stageAgentKey(agent.userId), STAGE_AGENT_LIMIT.limit, STAGE_AGENT_LIMIT.windowSec);
    if (!perAgent.ok) return refuse(429, 'rate_limited', perAgent.retryAfterSec);
    const device = await stagingDevice(db, agent.userId, deviceId);
    if (device !== 'ok') return refuse(403, device);
  } catch (err) {
    log.error({ errClass: errClass(err) }, 'stage.route_failed');
    return refuse(503, 'unavailable');
  }

  const slot = acquireStageSlot(agent.userId);
  if (!slot.ok) return refuse(503, 'busy', BUSY_RETRY_AFTER_SEC);
  try {
    const store = localStagingStore(env.DATA_DIR);
    const now = new Date();
    await sweepStaging(db, store, now); // expired rows, and orphaned temp and row-less files (TKT-30 review #3)
    const read = await readBodyWithin(req, BODY_READ_DEADLINE_MS, MAX_PHOTO_BYTES);
    if (!read.ok) {
      if (read.reason === 'timeout') return refuse(408, 'body_timeout');
      return read.reason === 'too_large' ? refuse(413, 'too_large') : refuse(400, 'bad_body');
    }
    const bytes = new Uint8Array(await new Blob(read.chunks).arrayBuffer());
    const r = await stagePhoto(db, store, { agentId: agent.userId, deviceId, bytes, mime, now });
    if ('error' in r) return refuse(r.error === 'too_large' ? 413 : r.error === 'bad_type' ? 415 : 429, r.error);
    log.info({ size: bytes.length }, 'stage.stored');
    return Response.json(r, { status: 201, headers: NO_STORE });
  } catch (err) {
    log.error({ errClass: errClass(err) }, 'stage.route_failed');
    return refuse(503, 'unavailable');
  } finally {
    slot.release();
  }
}

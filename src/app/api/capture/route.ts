import { AuthError, authErrorResponse } from '../../../lib/auth/guards';
import { acquireCaptureSlot } from '../../../lib/capture/in-flight';
import { BODY_READ_DEADLINE_MS, BUSY_RETRY_AFTER_SEC } from '../../../lib/capture/limits';
import { checkContentLength } from '../../../lib/capture/parse';
import { runCapture, type CaptureEvent } from '../../../lib/capture/pipeline';
import { readFormWithin } from '../../../lib/capture/read-form';
import { IP_LIMIT, ipKey } from '../../../lib/capture/rate-limit';
import { consume, refund } from '../../../lib/rate-limit';
import { localStagingStore } from '../../../lib/capture/staging';
import { clientIp } from '../../../lib/client-ip';
import { env } from '../../../lib/config/env';
import { getDbReady, type Db } from '../../../lib/db/client';
import { errFields, log, withRequestId } from '../../../lib/log';
import { localMediaStore } from '../../../lib/media/store';
import { requestIdFrom } from '../../../lib/request-id';
import { requireSession, type Guarded } from '../../_auth/require';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'application/x-ndjson',
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no',
};

const line = (e: CaptureEvent) => new TextEncoder().encode(`${JSON.stringify(e)}\n`);

/** A refusal answered before the capture stream starts: one `rejected` line, logged by reason. */
function refusal(e: Extract<CaptureEvent, { t: 'rejected' }>): Response {
  log.info({ reason: e.reason, status: e.status, anchored: false }, 'capture.refused');
  const headers: Record<string, string> = { ...HEADERS };
  if (e.retryAfterSec !== undefined) headers['Retry-After'] = String(e.retryAfterSec);
  return new Response(line(e), { status: e.status, headers });
}

/**
 * POST /api/capture (technical-plan §3.1): multipart in, NDJSON progress out. The HTTP status follows
 * the first line: a boundary refusal answers 4xx; a capture that reaches verification streams 200.
 * Needs an agent session (401/403 JSON otherwise) and a device enrolled to that agent (§10).
 * Before the body is read (TSK-19.2/19.3): 411 without Content-Length, 413 above the body cap, 429 (with
 * Retry-After) past the per-address limit, then 503 (with Retry-After) when this agent already has
 * MAX_CAPTURES_PER_AGENT captures in flight or the process has MAX_CAPTURES_IN_FLIGHT (fix rounds 1-2).
 * The checks that cost no slot come first, so a refused request never holds one. The slot is held until
 * the capture's stream ends; a body that has not arrived within BODY_READ_DEADLINE_MS answers 408.
 */
export async function POST(req: Request): Promise<Response> {
  let agent: Guarded;
  try {
    agent = await requireSession('agent', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const tooBig = checkContentLength(req.headers);
  if (tooBig) return refusal({ t: 'rejected', reason: tooBig.reason, status: tooBig.status });

  let db: Db;
  let perIp: Awaited<ReturnType<typeof consume>>;
  const ip = { key: ipKey(clientIp(req.headers)), at: new Date() };
  try {
    db = await getDbReady();
    perIp = await consume(db, ip.key, IP_LIMIT.limit, IP_LIMIT.windowSec, ip.at);
  } catch (err) {
    log.error(errFields(err), 'capture.route_failed');
    return new Response(line({ t: 'error', retryable: true }), { status: 503, headers: HEADERS });
  }
  if (!perIp.ok) return refusal({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: perIp.retryAfterSec });

  const slot = acquireCaptureSlot(agent.userId);
  if (!slot.ok) {
    log.warn({ scope: slot.scope }, 'capture.busy');
    return new Response(line({ t: 'error', retryable: true }), { status: 503, headers: { ...HEADERS, 'Retry-After': String(BUSY_RETRY_AFTER_SEC) } });
  }
  let handedOff = false; // once the capture runs, it releases the slot when it ends
  try {
    return await accept(req, agent, db, slot.release, () => {
      handedOff = true;
    }, ip);
  } finally {
    if (!handedOff) slot.release();
  }
}

/** The capture from the body read on, holding a slot; `handOff` marks that the capture now owns it. */
async function accept(req: Request, agent: Guarded, db: Db, release: () => void, handOff: () => void, ip: { key: string; at: Date }): Promise<Response> {
  const read = await readFormWithin(req, BODY_READ_DEADLINE_MS);
  if (!read.ok) {
    if (read.reason === 'timeout') {
      // Retryable: the phone keeps its outbox copy and sends it again (a `rejected` line would drop it).
      log.info({ reason: 'body_timeout', status: 408 }, 'capture.refused');
      return new Response(line({ t: 'error', retryable: true }), { status: 408, headers: HEADERS });
    }
    return read.reason === 'too_large'
      ? refusal({ t: 'rejected', reason: 'body_too_large', status: 413 })
      : refusal({ t: 'rejected', reason: 'bad_form', status: 400 });
  }
  const form = read.form;

  // A client that disconnects cancels the stream. The capture carries on (it may already be
  // committing) and simply stops being delivered: `emit` and `close` never throw.
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });
  let resolveFirst!: (e: CaptureEvent | null) => void;
  const first = new Promise<CaptureEvent | null>((r) => {
    resolveFirst = r;
  });
  const emit = (e: CaptureEvent) => {
    resolveFirst(e);
    if (closed) return;
    try {
      controller.enqueue(line(e));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // already closed or cancelled
    }
  };

  handOff();
  void (async () => {
    try {
      // The request id rides on every capture log line (e.g. capture.idempotent_replay, TKT-09).
      const requestLog = withRequestId(requestIdFrom(req.headers.get('x-request-id')));
      const deps = { db, media: localMediaStore(env.DATA_DIR), staging: localStagingStore(env.DATA_DIR), agentId: agent.userId, log: requestLog };
      await runCapture(form, deps, emit);
    } catch (err) {
      // runCapture never rejects; this is the media store's configuration failing.
      log.error(errFields(err), 'capture.route_failed');
      emit({ t: 'error', retryable: true });
    } finally {
      release();
      resolveFirst(null);
      close();
    }
  })();

  const f = await first;
  // A 409 media_not_staged is not an attempt; its resend with the bytes is (TKT-30 review #5).
  if (f?.t === 'rejected' && f.reason === 'media_not_staged') {
    try {
      await refund(db, ip.key, IP_LIMIT.windowSec, ip.at);
    } catch (err) {
      log.warn(errFields(err), 'capture.refund_failed');
    }
  }
  const status = f?.t === 'rejected' ? f.status : f?.t === 'error' ? 503 : 200;
  const headers: Record<string, string> = { ...HEADERS };
  if (f?.t === 'rejected' && f.retryAfterSec !== undefined) headers['Retry-After'] = String(f.retryAfterSec);
  return new Response(body, { status, headers });
}

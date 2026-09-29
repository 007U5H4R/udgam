import { AuthError, authErrorResponse } from '../../../lib/auth/guards';
import { acquireCaptureSlot } from '../../../lib/capture/in-flight';
import { BUSY_RETRY_AFTER_SEC } from '../../../lib/capture/limits';
import { checkContentLength } from '../../../lib/capture/parse';
import { runCapture, type CaptureEvent } from '../../../lib/capture/pipeline';
import { consume, IP_LIMIT, ipKey } from '../../../lib/capture/rate-limit';
import { clientIp } from '../../../lib/client-ip';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';
import { localMediaStore } from '../../../lib/media/store';
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
 * Before the body is read (TSK-19.2/19.3): 411 without Content-Length, 413 above the body cap, 503 (with
 * Retry-After) when MAX_CAPTURES_IN_FLIGHT captures are already being processed (fix round 1), 429 (with
 * Retry-After) past the per-address limit. The slot is held until the capture's stream ends.
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

  const release = acquireCaptureSlot();
  if (!release) {
    log.warn('capture.busy');
    return new Response(line({ t: 'error', retryable: true }), { status: 503, headers: { ...HEADERS, 'Retry-After': String(BUSY_RETRY_AFTER_SEC) } });
  }
  let handedOff = false; // once the capture runs, it releases the slot when it ends
  try {
    return await accept(req, agent, release, () => {
      handedOff = true;
    });
  } finally {
    if (!handedOff) release();
  }
}

/** The capture from the per-address limit on, holding a slot; `handOff` marks that the capture now owns it. */
async function accept(req: Request, agent: Guarded, release: () => void, handOff: () => void): Promise<Response> {
  let db: Awaited<ReturnType<typeof getDbReady>>;
  let perIp: Awaited<ReturnType<typeof consume>>;
  try {
    db = await getDbReady();
    perIp = await consume(db, ipKey(clientIp(req.headers)), IP_LIMIT.limit, IP_LIMIT.windowSec);
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'capture.route_failed');
    return new Response(line({ t: 'error', retryable: true }), { status: 503, headers: HEADERS });
  }
  if (!perIp.ok) return refusal({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: perIp.retryAfterSec });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refusal({ t: 'rejected', reason: 'bad_form', status: 400 });
  }

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
      await runCapture(form, { db, media: localMediaStore(env.DATA_DIR), agentId: agent.userId }, emit);
    } catch (err) {
      // runCapture never rejects; this is the media store's configuration failing.
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'capture.route_failed');
      emit({ t: 'error', retryable: true });
    } finally {
      release();
      resolveFirst(null);
      close();
    }
  })();

  const f = await first;
  const status = f?.t === 'rejected' ? f.status : f?.t === 'error' ? 503 : 200;
  const headers: Record<string, string> = { ...HEADERS };
  if (f?.t === 'rejected' && f.retryAfterSec !== undefined) headers['Retry-After'] = String(f.retryAfterSec);
  return new Response(body, { status, headers });
}

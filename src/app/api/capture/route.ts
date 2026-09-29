import { AuthError, authErrorResponse } from '../../../lib/auth/guards';
import { checkContentLength } from '../../../lib/capture/parse';
import { runCapture, type CaptureEvent } from '../../../lib/capture/pipeline';
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
  return new Response(line(e), { status: e.status, headers: HEADERS });
}

/**
 * POST /api/capture (technical-plan §3.1): multipart in, NDJSON progress out. The HTTP status follows
 * the first line: a boundary refusal answers 4xx; a capture that reaches verification streams 200.
 * Needs an agent session (401/403 JSON otherwise) and a device enrolled to that agent (§10).
 * Before the body is read (TSK-19.2): 411 without Content-Length, 413 above the body cap.
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

  let db: Awaited<ReturnType<typeof getDbReady>>;
  try {
    db = await getDbReady();
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'capture.route_failed');
    return new Response(line({ t: 'error', retryable: true }), { status: 503, headers: HEADERS });
  }

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

  void (async () => {
    try {
      await runCapture(form, { db, media: localMediaStore(env.DATA_DIR), agentId: agent.userId }, emit);
    } catch (err) {
      // runCapture never rejects; this is the media store's configuration failing.
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'capture.route_failed');
      emit({ t: 'error', retryable: true });
    } finally {
      resolveFirst(null);
      close();
    }
  })();

  const f = await first;
  const status = f?.t === 'rejected' ? f.status : f?.t === 'error' ? 503 : 200;
  return new Response(body, { status, headers: HEADERS });
}

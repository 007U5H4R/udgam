import { runCapture, type CaptureEvent } from '../../../lib/capture/pipeline';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';
import { localMediaStore } from '../../../lib/media/store';
import { captureSessionGuard } from './guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'application/x-ndjson',
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no',
};

const line = (e: CaptureEvent) => new TextEncoder().encode(`${JSON.stringify(e)}\n`);

/**
 * POST /api/capture (technical-plan §3.1): multipart in, NDJSON progress out. The HTTP status follows
 * the first line: a boundary refusal answers 4xx; a capture that reaches verification streams 200.
 */
export async function POST(req: Request): Promise<Response> {
  const guard = await captureSessionGuard(req);
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(line({ t: 'rejected', reason: 'bad_form', status: 400 }), { status: 400, headers: HEADERS });
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
      const db = await getDbReady();
      await runCapture(form, { db, media: localMediaStore(env.DATA_DIR) }, emit);
    } catch (err) {
      // runCapture never rejects; this is the database handle failing to open.
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

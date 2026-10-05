import { MAX_BODY_BYTES } from './limits';

// Reading the capture body against a deadline (TASK-20 fix round 2, N2). `req.formData()` cannot be
// stopped once it has started, so a client that trickles its body would hold its capture slot until the
// server's request timeout (300 s). This reads the body stream itself, cancels it at the deadline, and
// only then parses the bytes as multipart form data.

export type ReadFormResult = { ok: true; form: FormData } | { ok: false; reason: 'timeout' | 'bad_form' | 'too_large' };

/**
 * The request's multipart form, if its whole body arrives within `deadlineMs`. `timeout` when it did not
 * (the read is cancelled), `too_large` past `maxBytes` (Content-Length is checked before this; the cap
 * holds even if a body runs past it), `bad_form` when the body breaks off or is not multipart.
 */
export async function readFormWithin(req: Request, deadlineMs: number, maxBytes: number = MAX_BODY_BYTES): Promise<ReadFormResult> {
  const read = await readBodyWithin(req, deadlineMs, maxBytes);
  if (!read.ok) return read;
  try {
    return { ok: true, form: await new Response(new Blob(read.chunks), { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData() };
  } catch {
    return { ok: false, reason: 'bad_form' };
  }
}

export type ReadBodyResult = { ok: true; chunks: Uint8Array<ArrayBuffer>[]; total: number } | { ok: false; reason: 'timeout' | 'bad_form' | 'too_large' };

/**
 * The request's raw body as the chunks that arrived, if they all arrive within `deadlineMs` and come to
 * at most `maxBytes` (also read by the photo staging route, TKT-30, whose body is the image itself).
 * Reasons as for readFormWithin.
 */
export async function readBodyWithin(req: Request, deadlineMs: number, maxBytes: number): Promise<ReadBodyResult> {
  if (!req.body) return { ok: false, reason: 'bad_form' };
  const reader = req.body.getReader();
  const stop = () => void reader.cancel().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deadlineMs);
  });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === 'timeout') {
        stop();
        return { ok: false, reason: 'timeout' };
      }
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        stop();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(next.value as Uint8Array<ArrayBuffer>);
    }
  } catch {
    return { ok: false, reason: 'bad_form' }; // the body broke off
  } finally {
    clearTimeout(timer);
  }
  return { ok: true, chunks, total };
}

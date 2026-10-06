import { MAX_BODY_BYTES, MAX_FIELD_BYTES, MAX_FORM_PARTS, MAX_PART_HEADER_BYTES } from './limits';

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
  const type = req.headers.get('content-type') ?? '';
  const body = Buffer.concat(read.chunks, read.total);
  // SEC-002: the shape is bounded on the raw bytes first, so the parser never builds thousands of parts.
  if (!formWithinLimits(body, type)) return { ok: false, reason: 'bad_form' };
  try {
    return { ok: true, form: await new Response(body, { headers: { 'content-type': type } }).formData() };
  } catch {
    return { ok: false, reason: 'bad_form' };
  }
}

/** The boundary of a `multipart/form-data` Content-Type (bare or quoted, 1–70 characters), else null. */
function boundaryOf(contentType: string): string | null {
  const params = /^\s*multipart\/form-data\s*;(.*)$/i.exec(contentType)?.[1];
  if (params === undefined) return null;
  const m = /(?:^|;)\s*boundary\s*=\s*(?:"([^"\r\n]{1,70})"|([^\s;"]{1,70}))\s*(?=;|$)/i.exec(params);
  return m ? (m[1] ?? m[2]!) : null;
}

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

/**
 * Is the part a file? Exactly one Content-Disposition line, carrying a `filename` parameter outside any
 * quoted string. Anything else counts as a text field, the stricter reading.
 */
function isFilePart(headers: string): boolean {
  const dispositions = headers.split('\r\n').filter((l) => /^content-disposition\s*:/i.test(l));
  return dispositions.length === 1 && /;\s*filename\*?\s*=/i.test(dispositions[0]!.replace(/"(?:[^"\\]|\\.)*"/g, '""'));
}

/**
 * Whether a multipart body stays within the capture form's shape (SEC-002), checked with a handful of
 * native byte searches whatever the body holds: at most MAX_FORM_PARTS parts, each header block at most
 * MAX_PART_HEADER_BYTES, each non-file field at most MAX_FIELD_BYTES, no preamble (the parser refuses
 * one as well), one closing delimiter at the end.
 * Every `CRLF--boundary` counts as a delimiter (a client picks a boundary its content never contains),
 * so the count is never under the parser's, and the search stops one past the cap.
 */
export function formWithinLimits(body: Buffer, contentType: string): boolean {
  const boundary = boundaryOf(contentType);
  if (boundary === null) return false;
  const dashed = Buffer.from(`--${boundary}`, 'latin1');
  const delimiter = Buffer.concat([CRLF, dashed]);
  // Each delimiter: where its part's content ends (`at`) and where the delimiter itself ends (`end`).
  // The body opens with the first delimiter: the parser refuses a preamble too.
  if (!body.subarray(0, dashed.length).equals(dashed)) return false;
  const found: { at: number; end: number }[] = [{ at: 0, end: dashed.length }];
  for (let from = dashed.length; found.length <= MAX_FORM_PARTS + 1; ) {
    const at = body.indexOf(delimiter, from);
    if (at === -1) break;
    found.push({ at, end: at + delimiter.length });
    from = at + delimiter.length;
  }
  if (found.length < 2 || found.length > MAX_FORM_PARTS + 1) return false;
  const closes = (d: { end: number }) => body[d.end] === 0x2d && body[d.end + 1] === 0x2d; // `--`
  if (!closes(found[found.length - 1]!)) return false;
  for (let i = 0; i < found.length - 1; i++) {
    const d = found[i]!;
    const next = found[i + 1]!.at;
    if (closes(d)) return false; // a closing delimiter before the last one
    const window = body.subarray(d.end, Math.min(next, d.end + MAX_PART_HEADER_BYTES + HEADER_END.length));
    const lineEnd = window.indexOf(CRLF);
    const headerEnd = lineEnd === -1 ? -1 : window.indexOf(HEADER_END, lineEnd);
    if (headerEnd === -1) return false; // no header block, or one longer than the cap
    const contentBytes = next - (d.end + headerEnd + HEADER_END.length);
    if (!isFilePart(window.subarray(lineEnd + CRLF.length, headerEnd).toString('latin1')) && contentBytes > MAX_FIELD_BYTES) return false;
  }
  return true;
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

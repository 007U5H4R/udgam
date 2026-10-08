// Test-only helpers for capture uploads (TKT-19).

/** Bytes that sniff as a JPEG (`FF D8 FF E0`) followed by a label, so each label hashes differently. */
export function fakeJpeg(label: string): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(`jpeg-bytes:${label}`);
  const out = new Uint8Array(4 + text.length);
  out.set([0xff, 0xd8, 0xff, 0xe0]);
  out.set(text, 4);
  return out;
}

/**
 * A POST carrying `fd` as multipart bytes with Content-Type and Content-Length set, as a browser sends
 * it (undici's Request leaves Content-Length off a FormData body, and the capture route refuses a body
 * without one with 411).
 */
export async function multipartRequest(url: string, fd: FormData, headers: Record<string, string> = {}): Promise<Request> {
  const encoded = new Response(fd);
  const body = new Uint8Array(await encoded.arrayBuffer());
  return new Request(url, {
    method: 'POST',
    body,
    headers: { 'content-type': encoded.headers.get('content-type')!, 'content-length': String(body.length), ...headers },
  });
}

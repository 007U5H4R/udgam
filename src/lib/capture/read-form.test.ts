import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FIELD_BYTES, MAX_FORM_PARTS, MAX_PART_HEADER_BYTES } from './limits';
import { readFormWithin } from './read-form';

// TASK-20 fix round 2 (N2): the capture body must arrive within a deadline; past it the read is cancelled.

const URL_ = 'http://localhost/api/capture';

async function multipart(): Promise<{ bytes: Uint8Array; type: string }> {
  const fd = new FormData();
  fd.set('payload', '{"v":1}');
  fd.set('photo0', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
  const r = new Response(fd);
  return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type')! };
}

/** A request whose body sends `first` and then nothing more until `end()` or `fail()`; records a cancel. */
function trickle(first: Uint8Array, type: string) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      c.enqueue(first);
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request(URL_, { method: 'POST', body, headers: { 'content-type': type }, duplex: 'half' } as RequestInit);
  return { req, cancelled: () => cancelled, send: (b: Uint8Array) => ctrl.enqueue(b), end: () => ctrl.close(), fail: () => ctrl.error(new Error('connection reset')) };
}

describe('readFormWithin', () => {
  it('a body that arrives in time is parsed as multipart form data, in chunks too', async () => {
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const reading = readFormWithin(t.req, 5_000);
    t.send(bytes.slice(10));
    t.end();
    const r = await reading;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.get('payload')).toBe('{"v":1}');
    expect(((r.form.get('photo0') as File).size)).toBe(7);
  });

  it('a body still arriving at the deadline → timeout, and the read is cancelled', async () => {
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const started = Date.now();
    const r = await readFormWithin(t.req, 150);
    expect(r).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(t.cancelled()).toBe(true);
  });

  it('a body that is not multipart, or that breaks off → bad_form', async () => {
    const plain = new Request(URL_, { method: 'POST', body: 'not a form', headers: { 'content-type': 'multipart/form-data; boundary=x' } });
    expect(await readFormWithin(plain, 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const reading = readFormWithin(t.req, 5_000);
    t.fail();
    expect(await reading).toEqual({ ok: false, reason: 'bad_form' });
    const none = new Request(URL_, { method: 'POST', headers: { 'content-type': type } });
    expect(await readFormWithin(none, 5_000)).toEqual({ ok: false, reason: 'bad_form' });
  });

  it('more bytes than the body cap → too_large, read no further', async () => {
    const { type } = await multipart();
    const t = trickle(new Uint8Array(40), type);
    const reading = readFormWithin(t.req, 5_000, 64);
    t.send(new Uint8Array(40));
    expect(await reading).toEqual({ ok: false, reason: 'too_large' });
    expect(t.cancelled()).toBe(true);
  });
});

// SEC-002 (Stage 10): the multipart parser builds every part before the form's structural checks run,
// so a 30 MB body of 360,000 one-byte parts held the event loop for 3.5 s. The number of parts, the size
// of each part's header block and the bytes of every non-file field are bounded before the parse; past
// any bound the answer is the structural refusal, bad_form, and the body is never parsed.
describe('readFormWithin: the form is bounded before it is parsed (SEC-002)', () => {
  const B = 'b0undary';
  const TYPE = `multipart/form-data; boundary=${B}`;
  const field = (name: string, value: string) => `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const file = (name: string, bytes: string, filename = 'p.jpg') =>
    `--${B}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n${bytes}\r\n`;
  const END = `--${B}--\r\n`;
  const req = (body: string, type = TYPE) => new Request(URL_, { method: 'POST', body, headers: { 'content-type': type } });
  const sixParts = () => field('payload', '{"v":1}') + field('signature', 'sig') + field('staged', '[]') + file('photo0', 'a') + file('photo1', 'b') + file('photo2', 'c');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the bounds: payload, signature, staged and three photos; 16 KiB per field; 2 KiB of part headers', () => {
    expect(MAX_FORM_PARTS).toBe(6);
    expect(MAX_FIELD_BYTES).toBe(16 * 1024);
    expect(MAX_PART_HEADER_BYTES).toBe(2 * 1024);
  });

  it('a form of the largest real shape is parsed (a quoted boundary too)', async () => {
    const r = await readFormWithin(req(sixParts() + END), 5_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.form.keys()]).toEqual(['payload', 'signature', 'staged', 'photo0', 'photo1', 'photo2']);
    const quoted = await readFormWithin(req(field('payload', 'x') + END, `multipart/form-data; boundary="${B}"`), 5_000);
    expect(quoted.ok && quoted.form.get('payload')).toBe('x');
  });

  it('one part more than the form can hold → bad_form, never parsed', async () => {
    const parse = vi.spyOn(Response.prototype, 'formData');
    expect(await readFormWithin(req(sixParts() + field('extra', 'x') + END), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    // the probe's shape: thousands of one-byte parts
    expect(await readFormWithin(req(file('photo0', 'x').repeat(5_000) + END), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('a text field above MAX_FIELD_BYTES → bad_form, never parsed; a file part of that size is read', async () => {
    const parse = vi.spyOn(Response.prototype, 'formData');
    const big = 'a'.repeat(MAX_FIELD_BYTES + 1);
    expect(await readFormWithin(req(field('payload', big) + END), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    // a filename hidden in a quoted name, or a second Content-Disposition, does not make a field a file
    const disguised = `--${B}\r\nContent-Disposition: form-data; name="a; filename=b"\r\n\r\n${big}\r\n${END}`;
    expect(await readFormWithin(req(disguised), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    const twice = `--${B}\r\nContent-Disposition: form-data; name="a"\r\nContent-Disposition: form-data; name="a"; filename="b"\r\n\r\n${big}\r\n${END}`;
    expect(await readFormWithin(req(twice), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    const atCap = await readFormWithin(req(field('payload', 'a'.repeat(MAX_FIELD_BYTES)) + file('photo0', big) + END), 5_000);
    expect(atCap.ok).toBe(true);
    if (atCap.ok) expect((atCap.form.get('photo0') as File).size).toBe(MAX_FIELD_BYTES + 1);
  });

  it('a part header block above MAX_PART_HEADER_BYTES → bad_form, never parsed', async () => {
    const parse = vi.spyOn(Response.prototype, 'formData');
    const long = file('photo0', 'x', 'f'.repeat(MAX_PART_HEADER_BYTES));
    expect(await readFormWithin(req(long + END), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('a body that is not multipart/form-data, has no boundary, has a preamble, or does not end with the closing delimiter → bad_form, never parsed', async () => {
    const parse = vi.spyOn(Response.prototype, 'formData');
    expect(await readFormWithin(req(`preamble\r\n${field('payload', 'x')}${END}`), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(await readFormWithin(req('a=1&a=2&a=3', 'application/x-www-form-urlencoded'), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(await readFormWithin(req(field('payload', 'x') + END, 'multipart/form-data'), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(await readFormWithin(req(field('payload', 'x')), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(await readFormWithin(req(field('payload', 'x') + END + field('payload', 'y') + END), 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    expect(parse).not.toHaveBeenCalled();
  });
});

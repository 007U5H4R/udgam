// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_THUMB_DECODES, placeholderJpeg, THUMB_MAX_INPUT_PIXELS, thumbnail, type ThumbDeps } from './thumbs';

// The cache write's rename can be made to fail (a full disk, a read-only mount): the test runs as root,
// so file modes cannot make it fail.
const fsFail = vi.hoisted(() => ({ rename: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (fsFail.rename) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return actual.rename(from, to);
    },
  };
});

// TSK-10.13 fix round 1 (quality MAJOR 1, minors 8/13/20): a thumbnail decode is bounded — sharp refuses
// an input over 50 MP at the header (the placeholder, cached), concurrent requests for one photo share
// one decode, and at most 2 decodes run at once process-wide. Cache misses are ENOENT only; a failed
// cache write still serves the bytes; the path guard holds for the original and the thumbnail.

const PHOTO = readFileSync('assets/demo-photos/branch-01.jpg'); // AI-generated demo photo (TP29)
const SHA = 'ab'.repeat(32);

let dir: string;
const logs: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
const log: NonNullable<ThumbDeps['log']> = {
  warn: (obj: Record<string, unknown>, msg: string) => void logs.push({ level: 'warn', obj, msg }),
  error: (obj: Record<string, unknown>, msg: string) => void logs.push({ level: 'error', obj, msg }),
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thumbs-'));
  mkdirSync(join(dir, 'media'), { recursive: true });
  logs.length = 0;
});
afterEach(() => {
  fsFail.rename = false;
  rmSync(dir, { recursive: true, force: true });
});

function store(name: string, bytes: Buffer): { path: string; sha256: string; thumbPath: null } {
  writeFileSync(join(dir, 'media', name), bytes);
  return { path: join('media', name), sha256: `${name.padEnd(2, 'x').slice(0, 2)}${SHA.slice(2)}`, thumbPath: null };
}

/** A real 16×16 JPEG whose SOF0 header claims 16000×16000 (256 MP): tiny on disk, huge if decoded. */
async function hugeHeaderJpeg(): Promise<Buffer> {
  const small = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#406040' } }).jpeg({ quality: 50 }).toBuffer();
  const b = Buffer.from(small);
  for (let i = 2; i < b.length - 9; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xc0) {
      b.writeUInt16BE(16000, i + 5); // height
      b.writeUInt16BE(16000, i + 7); // width
      return b;
    }
  }
  throw new Error('no SOF0 marker');
}

/** A decoder that answers only once opened, recording how many decodes run at once. */
function gatedDecoder() {
  let running = 0;
  let peak = 0;
  let open = false;
  const gates: (() => void)[] = [];
  const decode = vi.fn(async (input: Buffer) => {
    running++;
    peak = Math.max(peak, running);
    if (!open) await new Promise<void>((r) => gates.push(r));
    running--;
    return Buffer.from(`thumb:${input.length}`);
  });
  /** Let every decode, running or still queued, finish. */
  const openAll = () => {
    open = true;
    gates.splice(0).forEach((g) => g());
  };
  return { decode, peak: () => peak, running: () => running, openAll };
}

describe('thumbnail limits', () => {
  it('turns sharp\'s operation cache off (repeated large thumbnails otherwise plateau at ~1.26 GB)', () => {
    const c = sharp.cache();
    expect([c.memory.max, c.files.max, c.items.max]).toEqual([0, 0, 0]);
  });

  it('uses a 50 MP input limit and allows 2 decodes at once', () => {
    expect(THUMB_MAX_INPUT_PIXELS).toBe(50_000_000);
    expect(MAX_THUMB_DECODES).toBe(2);
  });

  it('an image over the pixel limit gets the placeholder, refused at the header (not decoded), and the placeholder is cached', async () => {
    const m = store('huge.jpg', await hugeHeaderJpeg());
    const bytes = await thumbnail(dir, m, { log });
    expect(bytes.equals(await placeholderJpeg())).toBe(true);
    expect(logs).toEqual([{ level: 'warn', obj: { reason: 'pixel_limit' }, msg: 'media.thumb_placeholder' }]);
    const cached = readFileSync(join(dir, 'thumbs', m.sha256.slice(0, 2), `${m.sha256}.jpg`));
    expect(cached.equals(bytes)).toBe(true);
    // the next request reads the cache: no second attempt, nothing logged
    const decode = vi.fn();
    expect((await thumbnail(dir, m, { log, decode })).equals(bytes)).toBe(true);
    expect(decode).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
  });

  it('bytes sharp cannot decode get the placeholder, cached (not re-decoded on every request)', async () => {
    const m = store('junk.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]));
    const bytes = await thumbnail(dir, m, { log });
    expect(bytes.equals(await placeholderJpeg())).toBe(true);
    expect(logs[0]).toEqual({ level: 'warn', obj: { reason: 'undecodable' }, msg: 'media.thumb_placeholder' });
    const decode = vi.fn();
    await thumbnail(dir, m, { log, decode });
    expect(decode).not.toHaveBeenCalled();
  });

  it('CR-006: a transient decode failure serves the placeholder without caching it; the next request decodes again', async () => {
    const m = store('flaky.jpg', PHOTO);
    const transient = vi.fn(async () => {
      throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
    });
    expect((await thumbnail(dir, m, { log, decode: transient })).equals(await placeholderJpeg())).toBe(true);
    expect(logs).toEqual([{ level: 'warn', obj: { reason: 'decode_failed' }, msg: 'media.thumb_placeholder' }]);
    const ok = vi.fn(async () => Buffer.from('real-thumb'));
    expect((await thumbnail(dir, m, { log, decode: ok })).toString()).toBe('real-thumb');
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('CR-006: an out-of-memory failure from the decoder is not cached either', async () => {
    const m = store('oom.jpg', PHOTO);
    await thumbnail(dir, m, { log, decode: async () => Promise.reject(new Error('VipsJpeg: Insufficient memory (case 4)')) });
    const ok = vi.fn(async () => Buffer.from('real-thumb'));
    expect((await thumbnail(dir, m, { log, decode: ok })).toString()).toBe('real-thumb');
  });

  it('CR-006: bytes that are not an image at all get the placeholder, cached', async () => {
    const m = store('text.jpg', Buffer.from('hello world'));
    expect((await thumbnail(dir, m, { log })).equals(await placeholderJpeg())).toBe(true);
    expect(logs[0]).toEqual({ level: 'warn', obj: { reason: 'undecodable' }, msg: 'media.thumb_placeholder' });
    const decode = vi.fn();
    await thumbnail(dir, m, { log, decode });
    expect(decode).not.toHaveBeenCalled();
  });

  it('a real photo becomes a JPEG of at most 320 px, never the original', async () => {
    const m = store('branch.jpg', PHOTO);
    const bytes = await thumbnail(dir, m, { log });
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(320);
    expect(bytes.equals(PHOTO)).toBe(false);
  });

  it('5 concurrent requests for one photo run the decoder once and all get its bytes', async () => {
    const m = store('one.jpg', PHOTO);
    const g = gatedDecoder();
    const all = Promise.all(Array.from({ length: 5 }, () => thumbnail(dir, m, { log, decode: g.decode })));
    await vi.waitFor(() => expect(g.running()).toBe(1));
    g.openAll();
    const out = await all;
    expect(g.decode).toHaveBeenCalledTimes(1);
    for (const b of out) expect(b.toString()).toBe(`thumb:${PHOTO.length}`);
  });

  it('6 different photos at once: never more than 2 decodes run together, and every one finishes', async () => {
    const g = gatedDecoder();
    const ms = Array.from({ length: 6 }, (_, i) => store(`p${i}.jpg`, Buffer.concat([PHOTO, Buffer.alloc(i)])));
    const all = Promise.all(ms.map((m) => thumbnail(dir, m, { log, decode: g.decode })));
    await vi.waitFor(() => expect(g.running()).toBe(2));
    await new Promise((r) => setTimeout(r, 50)); // the other four stay queued
    expect(g.running()).toBe(2);
    expect(g.decode).toHaveBeenCalledTimes(2);
    g.openAll();
    const out = await all;
    expect(g.peak()).toBe(2);
    expect(g.decode).toHaveBeenCalledTimes(6);
    expect(out.map((b) => b.toString())).toEqual(ms.map((_, i) => `thumb:${PHOTO.length + i}`));
  });

  it('a decoder failure frees its slot for the next decode', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    for (let i = 0; i < 3; i++) await thumbnail(dir, store(`f${i}.jpg`, PHOTO), { log, decode: failing });
    const ok = vi.fn(async () => Buffer.from('ok'));
    expect((await thumbnail(dir, store('after.jpg', PHOTO), { log, decode: ok })).toString()).toBe('ok');
  });
});

describe('thumbnail errors', () => {
  it('the path guard refuses an original or a thumbnail path outside the data directory', async () => {
    await expect(thumbnail(dir, { path: '../x.jpg', sha256: SHA, thumbPath: null }, { log })).rejects.toThrow('media path is outside the data directory');
    await expect(thumbnail(dir, { path: 'media/x.jpg', sha256: SHA, thumbPath: '../../etc/passwd' }, { log })).rejects.toThrow(
      'media path is outside the data directory',
    );
  });

  it('a missing original is an error (the route answers 500), not a placeholder', async () => {
    await expect(thumbnail(dir, { path: 'media/gone.jpg', sha256: SHA, thumbPath: null }, { log })).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('a cache read error other than ENOENT is an error, not "not cached"', async () => {
    const m = store('dir.jpg', PHOTO);
    // the cache path is a directory: EISDIR
    mkdirSync(join(dir, 'thumbs', m.sha256.slice(0, 2), `${m.sha256}.jpg`), { recursive: true });
    const decode = vi.fn(async () => Buffer.from('x'));
    await expect(thumbnail(dir, m, { log, decode })).rejects.toMatchObject({ code: 'EISDIR' });
    expect(decode).not.toHaveBeenCalled();
  });

  it('a failed cache write still serves the thumbnail, logs, and leaves no temp file', async () => {
    const m = store('ro.jpg', PHOTO);
    fsFail.rename = true;
    const bytes = await thumbnail(dir, m, { log, decode: async () => Buffer.from('fresh') });
    expect(bytes.toString()).toBe('fresh');
    expect(logs).toEqual([{ level: 'error', obj: { errClass: 'Error', code: 'ENOSPC' }, msg: 'media.thumb_cache_write_failed' }]);
    expect(readdirSync(join(dir, 'thumbs', m.sha256.slice(0, 2)))).toEqual([]);
  });
});

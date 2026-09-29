import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { log as defaultLog } from '../log';

// Photo thumbnails (TSK-10.13, review focus 8). A thumbnail is a separate file, never the original:
// a 320 px JPEG (EXIF stripped by re-encoding, orientation applied) cached at
// DATA_DIR/thumbs/<sha[0:2]>/<sha>.jpg, made on first request when the row has no thumb_path yet.
//
// A decode is bounded (TASK-11 fix round 1): sharp refuses an input over THUMB_MAX_INPUT_PIXELS when it
// reads the header, before decoding (a crafted 16000×16000 progressive JPEG of 2 MB otherwise costs
// ~780 MB and 6 s); concurrent requests for one thumbnail share one decode; and at most
// MAX_THUMB_DECODES decodes run at once in the process, the rest wait their turn. A photo that is over
// the limit or that sharp cannot decode (some HEIC builds) gets a plain placeholder, which is cached
// like any thumbnail so it is not decoded again on every request.

// sharp's operation cache is off (TKT-12): with it on, repeated large thumbnails for the admin review
// plateau at ~1.26 GB resident; thumbnails are cached on disk below instead.
sharp.cache(false);

export const THUMB_PX = 320;
/** The largest input sharp will decode for a thumbnail (a 12 MP phone photo is well under it). */
export const THUMB_MAX_INPUT_PIXELS = 50_000_000;
/** Thumbnail decodes allowed at once in the process. */
export const MAX_THUMB_DECODES = 2;

type Log = { warn(obj: Record<string, unknown>, msg: string): void; error(obj: Record<string, unknown>, msg: string): void };
export type ThumbDeps = {
  /** The decoder (tests inject one); by default sharp with the pixel limit. */
  decode?: (input: Buffer) => Promise<Buffer>;
  log?: Log;
};

let placeholder: Promise<Buffer> | undefined;
/** A dark 320 px square in the ground colour: "a photo is here, no preview". */
export function placeholderJpeg(): Promise<Buffer> {
  placeholder ??= sharp({ create: { width: THUMB_PX, height: THUMB_PX, channels: 3, background: '#191D1B' } })
    .jpeg({ quality: 70 })
    .toBuffer();
  return placeholder;
}

function sharpThumb(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: THUMB_MAX_INPUT_PIXELS, sequentialRead: true })
    .rotate()
    .resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

function inside(root: string, rel: string): string {
  const abs = resolve(root, rel);
  const r = relative(root, abs);
  if (r.startsWith('..') || isAbsolute(r)) throw new Error('media path is outside the data directory');
  return abs;
}

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);
const errCode = (err: unknown) => (err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined);

/** The process-wide decode slots: at most MAX_THUMB_DECODES run; the rest queue in arrival order. */
let active = 0;
const waiting: (() => void)[] = [];
async function withDecodeSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_THUMB_DECODES) active++;
  else await new Promise<void>((r) => waiting.push(r)); // the slot is handed over, `active` unchanged
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/** Thumbnails being made now, by cache file: a second request for the same photo waits on the first. */
const inflight = new Map<string, Promise<Buffer>>();

/** The cached thumbnail, or null when there is none yet (ENOENT only; any other error is thrown). */
async function readCached(abs: string): Promise<Buffer | null> {
  try {
    return await readFile(abs);
  } catch (err) {
    if (errCode(err) === 'ENOENT') return null;
    throw err;
  }
}

/** Best effort: a failed write is logged and the bytes are still served (the next request tries again). */
async function writeCache(abs: string, bytes: Buffer, log: Log): Promise<void> {
  const tmp = `${abs}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(tmp, bytes, { mode: 0o640 });
    await rename(tmp, abs);
  } catch (err) {
    log.error({ errClass: errClass(err), code: errCode(err) }, 'media.thumb_cache_write_failed');
    await unlink(tmp).catch(() => undefined);
  }
}

async function make(abs: string, original: string, deps: ThumbDeps, log: Log): Promise<Buffer> {
  const decode = deps.decode ?? sharpThumb;
  const bytes = await withDecodeSlot(async () => {
    const input = await readFile(original); // a missing original is an error, not a placeholder
    try {
      return await decode(input);
    } catch (err) {
      const reason = err instanceof Error && /pixel limit/i.test(err.message) ? 'pixel_limit' : 'undecodable';
      log.warn({ reason }, 'media.thumb_placeholder');
      return placeholderJpeg();
    }
  });
  await writeCache(abs, bytes, log);
  return bytes;
}

/** The thumbnail bytes for a stored photo (made and cached on first use). */
export async function thumbnail(dataDir: string, m: { path: string; sha256: string; thumbPath: string | null }, deps: ThumbDeps = {}): Promise<Buffer> {
  const log: Log = deps.log ?? defaultLog;
  const root = resolve(dataDir);
  const abs = inside(root, m.thumbPath ?? join('thumbs', m.sha256.slice(0, 2), `${m.sha256}.jpg`));
  const original = inside(root, m.path);
  const cached = await readCached(abs);
  if (cached) return cached;
  let pending = inflight.get(abs);
  if (!pending) {
    pending = make(abs, original, deps, log).finally(() => inflight.delete(abs));
    inflight.set(abs, pending);
  }
  return pending;
}

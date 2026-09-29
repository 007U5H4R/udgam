import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

// Photo thumbnails (TSK-10.13, review focus 8). A thumbnail is a separate file, never the original:
// a 320 px JPEG (EXIF stripped by re-encoding, orientation applied) cached at
// DATA_DIR/thumbs/<sha[0:2]>/<sha>.jpg, made on first request when the row has no thumb_path yet. A
// photo sharp cannot decode (some HEIC builds) gets a plain placeholder instead of failing.

export const THUMB_PX = 320;

let placeholder: Promise<Buffer> | undefined;
/** A dark 320 px square in the ground colour: "a photo is here, no preview". */
function placeholderJpeg(): Promise<Buffer> {
  placeholder ??= sharp({ create: { width: THUMB_PX, height: THUMB_PX, channels: 3, background: '#191D1B' } })
    .jpeg({ quality: 70 })
    .toBuffer();
  return placeholder;
}

function inside(root: string, rel: string): string {
  const abs = resolve(root, rel);
  const r = relative(root, abs);
  if (r.startsWith('..') || isAbsolute(r)) throw new Error('media path is outside the data directory');
  return abs;
}

/** The thumbnail bytes for a stored photo (made and cached on first use). */
export async function thumbnail(dataDir: string, m: { path: string; sha256: string; thumbPath: string | null }): Promise<Buffer> {
  const root = resolve(dataDir);
  const rel = m.thumbPath ?? join('thumbs', m.sha256.slice(0, 2), `${m.sha256}.jpg`);
  const abs = inside(root, rel);
  try {
    return await readFile(abs);
  } catch {
    // not made yet
  }
  let bytes: Buffer;
  try {
    bytes = await sharp(await readFile(inside(root, m.path)))
      .rotate()
      .resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
  } catch {
    return placeholderJpeg(); // unreadable here (e.g. HEIC without a decoder): not cached, tried again later
  }
  await mkdir(dirname(abs), { recursive: true });
  const tmp = `${abs}.${randomUUID()}.tmp`;
  await writeFile(tmp, bytes, { mode: 0o640 });
  await rename(tmp, abs);
  return bytes;
}

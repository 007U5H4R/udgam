import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Content-addressed media store (technical-plan §3.1 step 4). Files live at
// DATA_DIR/media/<sha[0:2]>/<sha>.<ext>; the stored path is relative to DATA_DIR.

export interface MediaStore {
  /** Store bytes under their SHA-256. `created` is false when the file was already there. */
  put(bytes: Uint8Array, sha256: string, mime: string): Promise<{ path: string; created: boolean }>;
  /** Remove a stored file (no-op when it is already gone). */
  remove(path: string): Promise<void>;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const SHA = /^[0-9a-f]{64}$/;

export function localMediaStore(dataDir: string): MediaStore {
  const root = resolve(dataDir);
  const inside = (rel: string) => {
    const abs = resolve(root, rel);
    const r = relative(root, abs);
    if (r.startsWith('..') || isAbsolute(r)) throw new Error('media path is outside the store');
    return abs;
  };

  return {
    async put(bytes, sha256, mime) {
      if (!SHA.test(sha256) || createHash('sha256').update(bytes).digest('hex') !== sha256) {
        throw new Error('media bytes do not match their sha256');
      }
      const path = join('media', sha256.slice(0, 2), `${sha256}.${EXT[mime] ?? 'bin'}`);
      const abs = inside(path);
      try {
        await stat(abs);
        return { path, created: false };
      } catch {
        // not there yet
      }
      await mkdir(dirname(abs), { recursive: true });
      const tmp = `${abs}.${randomUUID()}.tmp`;
      await writeFile(tmp, bytes, { mode: 0o640 });
      await rename(tmp, abs); // atomic on one filesystem; a concurrent writer of the same hash wrote the same bytes
      return { path, created: true };
    },

    async remove(path) {
      try {
        await unlink(inside(path));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
  };
}

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Content-addressed media store (technical-plan §3.1 step 4). Files live at
// DATA_DIR/media/<sha[0:2]>/<sha>.<ext>; the stored path is relative to DATA_DIR. An organic certificate
// (`application/pdf`, TKT-13) is stored at DATA_DIR/attestations/<sha>.pdf through the same holds.
//
// One file can belong to several requests and rows (the same photo bytes in two captures), so a
// failed request must never simply unlink "its" file. Every `put` takes an in-process hold on the
// path until the request `release`s it (after its transaction commits or fails), and
// `removeIfUnused` deletes only a file that no request holds and no committed row references.
// Puts and removals of one path are serialised, so a put that races a removal still ends with the
// file on disk.

export interface MediaStore {
  /** Store bytes under their SHA-256 and take a hold on the path. `created` is false when it was already there. */
  put(bytes: Uint8Array, sha256: string, mime: string): Promise<{ path: string; created: boolean }>;
  /** Drop one hold taken by `put`. */
  release(path: string): void;
  /**
   * Delete the file unless a request holds it or `isReferenced()` (a committed `media` row) says it
   * is in use. Resolves true when the file was removed.
   */
  removeIfUnused(path: string, isReferenced: () => Promise<boolean>): Promise<boolean>;
  /** Unconditionally remove a stored file (no-op when it is already gone). */
  remove(path: string): Promise<void>;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

const SHA = /^[0-9a-f]{64}$/;

// Process-wide, keyed by absolute path, so every store instance over one DATA_DIR shares them.
const holds = new Map<string, number>();
const pathLocks = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier put/remove of the same path has settled. */
function withPathLock<T>(abs: string, fn: () => Promise<T>): Promise<T> {
  const previous = pathLocks.get(abs) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  pathLocks.set(abs, tail);
  void tail.then(() => {
    if (pathLocks.get(abs) === tail) pathLocks.delete(abs);
  });
  return run;
}

async function unlinkIfPresent(abs: string): Promise<void> {
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function localMediaStore(dataDir: string): MediaStore {
  const root = resolve(dataDir);
  const inside = (rel: string) => {
    const abs = resolve(root, rel);
    const r = relative(root, abs);
    if (r.startsWith('..') || isAbsolute(r)) throw new Error('media path is outside the store');
    return abs;
  };
  const pathOf = (sha256: string, mime: string) =>
    mime === 'application/pdf'
      ? join('attestations', `${sha256}.pdf`)
      : join('media', sha256.slice(0, 2), `${sha256}.${EXT[mime] ?? 'bin'}`);
  const release = (path: string) => {
    const abs = inside(path);
    const n = (holds.get(abs) ?? 0) - 1;
    if (n > 0) holds.set(abs, n);
    else holds.delete(abs);
  };

  return {
    async put(bytes, sha256, mime) {
      if (!SHA.test(sha256) || createHash('sha256').update(bytes).digest('hex') !== sha256) {
        throw new Error('media bytes do not match their sha256');
      }
      const path = pathOf(sha256, mime);
      const abs = inside(path);
      holds.set(abs, (holds.get(abs) ?? 0) + 1); // synchronously, before any await
      try {
        return await withPathLock(abs, async () => {
          try {
            await stat(abs);
            return { path, created: false };
          } catch {
            // not there yet
          }
          await mkdir(dirname(abs), { recursive: true });
          const tmp = `${abs}.${randomUUID()}.tmp`;
          await writeFile(tmp, bytes, { mode: 0o640 });
          await rename(tmp, abs); // atomic on one filesystem
          return { path, created: true };
        });
      } catch (err) {
        release(path);
        throw err;
      }
    },

    release,

    removeIfUnused(path, isReferenced) {
      const abs = inside(path);
      return withPathLock(abs, async () => {
        // Held first, then referenced: a holder releases only after its row has committed.
        if ((holds.get(abs) ?? 0) > 0) return false;
        if (await isReferenced()) return false;
        if ((holds.get(abs) ?? 0) > 0) return false; // a put arrived while the reference check ran
        await unlinkIfPresent(abs);
        return true;
      });
    },

    async remove(path) {
      const abs = inside(path);
      await withPathLock(abs, () => unlinkIfPresent(abs));
    },
  };
}

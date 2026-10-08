import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localMediaStore } from './store';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'udgam-media-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const bytes = new TextEncoder().encode('a photo');
const sha = createHash('sha256').update(bytes).digest('hex');

describe('localMediaStore', () => {
  it('writes content-addressed files at media/<sha[0:2]>/<sha>.<ext> under DATA_DIR', async () => {
    const store = localMediaStore(root);
    const r = await store.put(bytes, sha, 'image/jpeg');
    expect(r).toEqual({ path: `media/${sha.slice(0, 2)}/${sha}.jpg`, created: true });
    expect(readFileSync(join(root, r.path))).toEqual(Buffer.from(bytes));
  });

  it('is idempotent: a second put of the same hash reuses the file and reports it was not created', async () => {
    const store = localMediaStore(root);
    const a = await store.put(bytes, sha, 'image/jpeg');
    const b = await store.put(bytes, sha, 'image/jpeg');
    expect(b).toEqual({ path: a.path, created: false });
    expect(readdirSync(join(root, 'media', sha.slice(0, 2)))).toEqual([`${sha}.jpg`]); // no temp files left
  });

  it('refuses bytes that do not hash to the given sha256', async () => {
    const store = localMediaStore(root);
    await expect(store.put(bytes, 'f'.repeat(64), 'image/jpeg')).rejects.toThrow(/sha256/);
    expect(existsSync(join(root, 'media'))).toBe(false);
  });

  it('maps common image types to extensions', async () => {
    const store = localMediaStore(root);
    for (const [mime, ext] of [
      ['image/png', 'png'],
      ['image/heic', 'heic'],
      ['image/webp', 'webp'],
      ['application/octet-stream', 'bin'],
    ] as const) {
      const b = new TextEncoder().encode(mime);
      const h = createHash('sha256').update(b).digest('hex');
      expect((await store.put(b, h, mime)).path.endsWith(`.${ext}`)).toBe(true);
    }
  });

  it('removeIfUnused keeps a file while any request holds it or a committed row references it', async () => {
    const a = localMediaStore(root);
    const b = localMediaStore(root); // another request's store instance over the same DATA_DIR
    const { path } = await a.put(bytes, sha, 'image/jpeg');
    await b.put(bytes, sha, 'image/jpeg');
    a.release(path);
    // b still holds it
    expect(await a.removeIfUnused(path, async () => false)).toBe(false);
    expect(existsSync(join(root, path))).toBe(true);
    b.release(path);
    // nobody holds it, but a committed media row references it
    expect(await a.removeIfUnused(path, async () => true)).toBe(false);
    expect(existsSync(join(root, path))).toBe(true);
    // unheld and unreferenced: removed
    expect(await a.removeIfUnused(path, async () => false)).toBe(true);
    expect(existsSync(join(root, path))).toBe(false);
  });

  it('a put that starts while a removal is deciding still ends with the file on disk', async () => {
    const store = localMediaStore(root);
    const { path } = await store.put(bytes, sha, 'image/jpeg');
    store.release(path);
    let letGo!: () => void;
    const gate = new Promise<void>((r) => (letGo = r));
    const removing = store.removeIfUnused(path, async () => {
      await gate; // the reference check is slow
      return false;
    });
    const putting = store.put(bytes, sha, 'image/jpeg'); // takes a hold before the removal decides
    letGo();
    expect(await removing).toBe(false);
    await putting;
    expect(existsSync(join(root, path))).toBe(true);
    store.release(path);
  });

  it('removes a file, tolerates a missing one and refuses paths outside the store', async () => {
    const store = localMediaStore(root);
    const { path } = await store.put(bytes, sha, 'image/jpeg');
    await store.remove(path);
    expect(existsSync(join(root, path))).toBe(false);
    await expect(store.remove(path)).resolves.toBeUndefined();
    await expect(store.remove('../outside.jpg')).rejects.toThrow(/outside/);
  });
});

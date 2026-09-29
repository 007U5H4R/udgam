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

  it('removes a file, tolerates a missing one and refuses paths outside the store', async () => {
    const store = localMediaStore(root);
    const { path } = await store.put(bytes, sha, 'image/jpeg');
    await store.remove(path);
    expect(existsSync(join(root, path))).toBe(false);
    await expect(store.remove(path)).resolves.toBeUndefined();
    await expect(store.remove('../outside.jpg')).rejects.toThrow(/outside/);
  });
});

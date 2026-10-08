import { existsSync } from 'node:fs';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// TKT-30 review #3: the server sweeps expired and orphaned staged files when it starts (instrumentation.ts
// calls sweepStagingAtBoot), so files left by a crash do not wait for the next stage call.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe('sweepStagingAtBoot', () => {
  it('removes a temp file older than an hour left under DATA_DIR/staging; a fresh one stays', async () => {
    const dir = join(t.dir, 'staging', 'AG-BOOT');
    await mkdir(dir, { recursive: true });
    const old = join(dir, `${'a'.repeat(64)}.crash.tmp`);
    const fresh = join(dir, `${'b'.repeat(64)}.writing.tmp`);
    await writeFile(old, 'x');
    await writeFile(fresh, 'x');
    const twoHoursAgo = (Date.now() - 2 * 3600_000) / 1000;
    await utimes(old, twoHoursAgo, twoHoursAgo);
    const { sweepStagingAtBoot } = await import('./staging-boot');
    await sweepStagingAtBoot();
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('never throws: a failing sweep is logged and the server still starts', async () => {
    vi.doMock('./staging', async (orig) => ({ ...(await orig<typeof import('./staging')>()), sweepStaging: async () => Promise.reject(new Error('disk gone')) }));
    const { sweepStagingAtBoot } = await import('./staging-boot');
    await expect(sweepStagingAtBoot()).resolves.toBeUndefined();
    vi.doUnmock('./staging');
  });
});

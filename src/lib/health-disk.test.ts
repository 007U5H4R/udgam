import { describe, expect, it } from 'vitest';
import { diskHealth } from './health-disk';

// SEC-003 (TKT-28): free bytes on DATA_DIR's filesystem against a threshold, from fs.statfs.

const statfs = (bavail: number, bsize = 4096) => async () => ({ bavail, bsize });
const GiB = 1024 ** 3;

describe('diskHealth', () => {
  it('ok at or above the threshold, low below it; free bytes are the blocks available to the app user', async () => {
    expect(await diskHealth('/data', 10 * GiB, statfs((10 * GiB) / 4096))).toEqual({ status: 'ok', freeBytes: 10 * GiB });
    expect(await diskHealth('/data', 10 * GiB, statfs((10 * GiB) / 4096 - 1))).toEqual({ status: 'low', freeBytes: 10 * GiB - 4096 });
  });

  it('a threshold of 0 never reports low', async () => {
    expect((await diskHealth('/data', 0, statfs(0))).status).toBe('ok');
  });

  it('unknown when the filesystem cannot be read (DATA_DIR missing)', async () => {
    const r = await diskHealth('/nope', GiB, async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(r).toEqual({ status: 'unknown', freeBytes: null });
  });

  it('reads the real filesystem by default', async () => {
    const r = await diskHealth('.', 1);
    expect(r.status).toBe('ok');
    expect(r.freeBytes).toBeGreaterThan(1);
  });
});

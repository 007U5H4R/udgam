// @vitest-environment node
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { writeTx } from '../db/client';
import { ledgerCheckpoints } from '../db/schema';
import { append } from './hashchain';
import { loadLedgerKey, type LedgerKey } from './keys';
import { checkpointTimerEnabled, startCheckpointTimer } from './checkpoint-timer';

// EXE54 (TKT-28 fix round 1): a quiet day must not leave entries unsealed until someone opens a
// certificate. A background timer (instrumentation, server only, one per process) seals the entries
// after the last checkpoint every LEDGER_CHECKPOINT_INTERVAL_SEC (default 1 h), through writeTx, never
// overlapping itself, and only in a real deployment unless a test starts it.

let t: TempDb;
let key: LedgerKey;
beforeEach(async () => {
  t = await tempDb();
  key = await loadLedgerKey(join(t.dir, 'keys', 'ledger.jwk'));
});
afterEach(async () => {
  vi.useRealTimers();
  await t.cleanup();
});

const checkpoints = () => t.db.select().from(ledgerCheckpoints);

describe('startCheckpointTimer (EXE54)', () => {
  it('seals entries appended before the interval elapsed, with no feed request; an idle tick writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await writeTx(t.db, async (tx) => {
      for (let i = 1; i <= 3; i++) await append(tx, 'harvest_event', { i });
    });
    const stop = startCheckpointTimer({ intervalMs: 3_600_000, getDb: async () => t.db, opts: { key } });
    try {
      expect(await checkpoints()).toHaveLength(0); // nothing at start: the first tick is one interval away
      await vi.advanceTimersByTimeAsync(3_600_000);
      await vi.waitFor(async () => expect(await checkpoints()).toHaveLength(1));
      expect((await checkpoints())[0]).toMatchObject({ fromSeq: 1, toSeq: 3, keyId: key.kid });

      await vi.advanceTimersByTimeAsync(3_600_000); // nothing new: no empty checkpoint
      expect(await checkpoints()).toHaveLength(1);

      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 4 }));
      await vi.advanceTimersByTimeAsync(3_600_000);
      await vi.waitFor(async () => expect(await checkpoints()).toHaveLength(2));
      expect((await checkpoints())[1]).toMatchObject({ fromSeq: 4, toSeq: 4 });
    } finally {
      stop();
    }
  });

  it('never overlaps itself: a slow seal skips the ticks that come while it runs', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let calls = 0;
    let finish!: () => void;
    const seal = vi.fn(async () => {
      calls += 1;
      await new Promise<void>((r) => (finish = r));
      return null;
    });
    const stop = startCheckpointTimer({ intervalMs: 1000, getDb: async () => t.db, seal });
    try {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000); // five more ticks while the first is still sealing
      expect(calls).toBe(1);
      finish();
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(2);
    } finally {
      finish?.();
      stop();
    }
  });

  it('one timer per process: a second start while one runs is a no-op until it is stopped', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const seal = vi.fn(async () => null);
    const stop1 = startCheckpointTimer({ intervalMs: 1000, getDb: async () => t.db, seal });
    const stop2 = startCheckpointTimer({ intervalMs: 1000, getDb: async () => t.db, seal });
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect(seal).toHaveBeenCalledTimes(1);
    } finally {
      stop2();
      stop1();
    }
  });

  it('a failed seal is logged and retried on the next tick', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const seal = vi.fn().mockRejectedValueOnce(new Error('SQLITE_BUSY')).mockResolvedValue(null);
    const stop = startCheckpointTimer({ intervalMs: 1000, getDb: async () => t.db, seal });
    try {
      await vi.advanceTimersByTimeAsync(2000);
      expect(seal).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});

describe('checkpointTimerEnabled', () => {
  it('runs in a real deployment only: not under tests, dev or the Playwright server (E2E=1)', () => {
    expect(checkpointTimerEnabled({ NODE_ENV: 'production', E2E: '0' })).toBe(true);
    expect(checkpointTimerEnabled({ NODE_ENV: 'production', E2E: '1' })).toBe(false);
    expect(checkpointTimerEnabled({ NODE_ENV: 'test', E2E: '0' })).toBe(false);
    expect(checkpointTimerEnabled({ NODE_ENV: 'development', E2E: '0' })).toBe(false);
  });
});

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { checkpointIfNeeded } from '../checkpoint';
import { ANCHOR_WAIT_MS, getProof } from '../feed';
import { append, setOnAppended } from '../hashchain';
import { loadLedgerKey } from '../keys';
import { recordPending } from './adapter';

// TSK-24.6 (TASK-25 fix round 1, quality finding 10): building a proof waits at most ANCHOR_WAIT_MS
// (3 s) for pending anchors. An anchoring run that never settles (a chain that hangs) cannot hold the
// proof: it answers with evm {status:'pending'} once the wait is over.

let t: TempDb;
let previousHook: ReturnType<typeof setOnAppended>;
beforeEach(async () => {
  previousHook = setOnAppended(undefined);
  t = await tempDb();
  await writeTx(t.db, async (tx) => {
    const a = await append(tx, 'plot_registered', { plotId: 'P-1' });
    await recordPending(tx, a.seq);
  });
  const key = await loadLedgerKey(join(t.dir, 'keys', 'ledger.jwk'));
  await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key }));
});
afterEach(async () => {
  setOnAppended(previousHook);
  await t.cleanup();
});

describe('proof wait for anchoring', () => {
  it('the wait is 3 s', () => {
    expect(ANCHOR_WAIT_MS).toBe(3_000);
  });

  it('a hanging anchoring run → the proof answers evm pending after the 3 s wait, not later', async () => {
    let calls = 0;
    const hanging = {
      adapter: 'evm' as const,
      anchorPending: () => {
        calls++;
        return new Promise<never>(() => undefined);
      },
    };
    const started = Date.now();
    const p = await getProof(t.db, 1, { ledger: hanging });
    const elapsed = Date.now() - started;
    expect(calls).toBe(1);
    expect(p.entry).toMatchObject({ seq: 1, evm: { status: 'pending' } });
    expect(elapsed).toBeGreaterThanOrEqual(2_900);
    expect(elapsed).toBeLessThan(8_000);
  });

  it('a rejecting anchoring run does not fail the proof', async () => {
    const failing = { adapter: 'evm' as const, anchorPending: () => Promise.reject(new Error('rpc down')) };
    const p = await getProof(t.db, 1, { ledger: failing });
    expect(p.entry).toMatchObject({ seq: 1, evm: { status: 'pending' } });
  });
});

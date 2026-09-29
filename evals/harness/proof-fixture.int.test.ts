import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { maybeCheckpoint } from '../../src/lib/ledger/checkpoint';
import { setOnAppended } from '../../src/lib/ledger/hashchain';
import { buildProofFixture } from './proof-fixture';

// TASK-19 follow-up (review finding 6): the fixture's temporary hook, ledger and key do not outlive it.

describe('buildProofFixture', () => {
  it('close() restores the hook that was installed before it, and removes its temp directory', async () => {
    const previous = async () => {};
    setOnAppended(previous);
    try {
      const fx = await buildProofFixture({ events: 2, plots: 1 });
      expect(existsSync(fx.dir)).toBe(true);
      await fx.close();
      expect(existsSync(fx.dir)).toBe(false);
      // setOnAppended returns the hook it replaces: it must be the one we installed, not maybeCheckpoint.
      expect(setOnAppended(maybeCheckpoint)).toBe(previous);
    } finally {
      setOnAppended(maybeCheckpoint);
    }
  }, 60_000);
});

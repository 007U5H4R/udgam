// TSK-24.7 · TC-073 unchanged: the clean-room checker ignores the optional per-entry `evm` member that a
// server on the EVM ledger adapter adds (docs/proof-feed.md §4.3, §13). It is not hashed, so it changes
// no verification step, whatever it holds.
import { describe, expect, it } from 'vitest';
import { checkFeed } from './src/verify';
import { sampleFeed } from './test-feed';

type Json = Record<string, unknown>;

describe('checkFeed ignores the optional evm member', () => {
  it('a feed whose entries carry anchored, pending and failed evm members verifies as before', async () => {
    const { feed, keys } = await sampleFeed();
    const entries = (feed as Json).entries as Json[];
    entries.forEach((e, i) => {
      e.evm =
        i % 3 === 0
          ? { status: 'anchored', chainId: 31337, contract: `0x${'5f'.repeat(20)}`, txHash: `0x${'8c'.repeat(32)}`, blockNumber: 40 + i }
          : i % 3 === 1
            ? { status: 'pending' }
            : { status: 'failed' };
    });
    const r = await checkFeed(JSON.parse(JSON.stringify(feed)), keys);
    expect(r).toEqual({ ok: true, verified: entries.length, total: entries.length });
  });

  it('the evm member does not mask a tamper: a changed payload still fails at payload-hash', async () => {
    const { feed, keys } = await sampleFeed();
    const entries = (feed as Json).entries as (Json & { kind: string; payload: Json })[];
    for (const e of entries) e.evm = { status: 'pending' };
    const ev = entries.find((x) => x.kind === 'harvest_event')!;
    (ev.payload.capture as Json).cherryKg = 99;
    const r = await checkFeed(feed, keys);
    expect(r).toMatchObject({ ok: false, failure: { step: 'payload-hash' } });
  });
});

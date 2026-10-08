import { beforeAll, describe, expect, it } from 'vitest';
import { makeContext, makeDevice, makeSubmission, type TestDevice } from '../../../../tests/helpers/verify';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import type { VerifyContext } from '../types';
import { runCheck } from '../verify';

// TC-041, TSK-09.4, §6.3 and TP10: per-device chain continuity. ok when seq = lastSeq + 1 and the previous
// hash is the device's chain head, or on genesis for an agent with no accepted entries; flag otherwise
// (a gap, a stale hash, a replayed old position, or a new phone for an agent with history). Never fails.

let dev: TestDevice;
beforeAll(async () => {
  dev = await makeDevice();
});

const chain = (): Check => {
  const c = REGISTRY.find((x) => x.id === 'chain_continuity');
  if (!c) throw new Error('chain_continuity is not in the registry');
  return c;
};

const HEAD = 'ab'.repeat(32); // the device's last accepted event hash (entry 13)
const STALE = 'cd'.repeat(32);

async function run(p: { seq: number; prevEventHash: string }, device: Partial<VerifyContext['device']>, agentPriorAcceptedEvents = 0) {
  const sub = await makeSubmission({ device: dev, seq: p.seq, prevEventHash: p.prevEventHash });
  const ctx = makeContext(dev, { agentPriorAcceptedEvents });
  return runCheck(chain(), sub, { ...ctx, device: { ...ctx.device, ...device } }, CONFIG);
}

describe('chain_continuity (TC-041)', () => {
  it('seq = lastSeq + 1 with the correct previous hash → ok "Entry 14 follows entry 13 from this phone"', async () => {
    expect(await run({ seq: 14, prevEventHash: HEAD }, { lastSeq: 13, lastEventHash: HEAD }, 13)).toMatchObject({
      status: 'ok',
      hardFail: false,
      evidence: 'Entry 14 follows entry 13 from this phone',
    });
  });

  it('a gap (seq + 2) → flag "Expected entry 14 after <prev8>, got entry 15"', async () => {
    expect(await run({ seq: 15, prevEventHash: HEAD }, { lastSeq: 13, lastEventHash: HEAD }, 13)).toMatchObject({
      status: 'flag',
      hardFail: false,
      evidence: `Expected entry 14 after ${HEAD.slice(0, 8)}, got entry 15`,
    });
  });

  it('the right seq with a stale previous hash → flag', async () => {
    expect(await run({ seq: 14, prevEventHash: STALE }, { lastSeq: 13, lastEventHash: HEAD }, 13)).toMatchObject({
      status: 'flag',
      evidence: `Expected entry 14 after ${HEAD.slice(0, 8)}, got entry 14`,
    });
  });

  it('EVAL-035: an old position replayed (seq − 2) with a stale hash → flag', async () => {
    expect(await run({ seq: 11, prevEventHash: STALE }, { lastSeq: 13, lastEventHash: HEAD }, 13)).toMatchObject({
      status: 'flag',
      evidence: `Expected entry 14 after ${HEAD.slice(0, 8)}, got entry 11`,
    });
  });

  it('genesis on a device at lastSeq 0 when the agent has no accepted entries → ok', async () => {
    expect(await run({ seq: 1, prevEventHash: 'genesis' }, { lastSeq: 0, lastEventHash: null }, 0)).toMatchObject({
      status: 'ok',
      evidence: 'Entry 1 follows entry 0 from this phone',
    });
  });

  it('EVAL-021: genesis on a new phone when the agent has 23 earlier accepted entries → flag', async () => {
    expect(await run({ seq: 1, prevEventHash: 'genesis' }, { lastSeq: 0, lastEventHash: null }, 23)).toMatchObject({
      status: 'flag',
      hardFail: false,
      evidence: 'First entry from a new phone; this agent has 23 earlier entries on another phone',
    });
  });

  it('a genesis claim on a phone that already has a chain → flag (it cannot restart)', async () => {
    expect(await run({ seq: 1, prevEventHash: 'genesis' }, { lastSeq: 13, lastEventHash: HEAD }, 13)).toMatchObject({
      status: 'flag',
      evidence: `Expected entry 14 after ${HEAD.slice(0, 8)}, got entry 1`,
    });
  });

  it('a first entry that does not start at seq 1 or names a previous hash → flag', async () => {
    expect(await run({ seq: 2, prevEventHash: 'genesis' }, { lastSeq: 0, lastEventHash: null }, 0)).toMatchObject({
      status: 'flag',
      evidence: 'Expected entry 1 after genesis, got entry 2',
    });
    expect(await run({ seq: 1, prevEventHash: HEAD }, { lastSeq: 0, lastEventHash: null }, 0)).toMatchObject({ status: 'flag' });
  });

  it('never returns fail and never hard-fails', async () => {
    const cases: [number, string, number, string | null, number][] = [
      [1, 'genesis', 0, null, 0],
      [1, 'genesis', 0, null, 5],
      [99, STALE, 13, HEAD, 13],
      [1, STALE, 13, HEAD, 13],
      [14, HEAD, 13, HEAD, 13],
    ];
    for (const [seq, prevEventHash, lastSeq, lastEventHash, prior] of cases) {
      const r = await run({ seq, prevEventHash }, { lastSeq, lastEventHash }, prior);
      expect(['ok', 'flag']).toContain(r.status);
      expect(r.hardFail).toBe(false);
    }
  });
});

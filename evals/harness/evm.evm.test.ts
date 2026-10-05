import { describe, expect, inject, it } from 'vitest';
import { evaluate } from './run';

// EVAL-103 · TC-083 (TSK-24.8): the proof and tamper suites (EVAL-058–063) pass on the EVM ledger
// adapter against Anvil, every intact entry carries a txHash and blockNumber that match the chain, and
// the results' provenance records `ledger: evm`. The only network used is the local chain's RPC.

describe('pnpm eval --ledger=evm (harness-proof)', () => {
  it('EVAL-103 and EVAL-058–063 pass on the EVM adapter; provenance says evm; no other network', async () => {
    const r = await evaluate({ seed: 7, suites: ['harness-proof'], milestone: 'M2', ledger: 'evm', evmRpcUrl: inject('anvilRpcUrl') });
    expect(r.provenance.ledger).toBe('evm');
    const byId = new Map(r.cases.map((c) => [c.id, c]));
    for (const id of ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-103']) {
      expect(byId.get(id)?.outcome, `${id}: ${byId.get(id)?.notes.join(' | ')}`).toBe('passed');
    }
    expect(byId.get('EVAL-103')!.notes.join(' ')).toMatch(/(\d+)\/\1 closure entries anchored with txHash and blockNumber matching the chain/);
    expect(r.runtime.networkCalls).toEqual([]);
    expect(r.runtime.localChainRpcCalls).toBeGreaterThan(0);
    expect(r.gates.find((g) => g.id === 'S6-lib')).toMatchObject({ pass: true });
  });
});

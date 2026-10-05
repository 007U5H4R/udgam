import { describe, expect, it } from 'vitest';
import { evaluate, parseArgs } from './run';

// TSK-24.8: `pnpm eval --ledger=evm` selects the EVM ledger adapter for the harness-proof suite. On the
// default hash-chain adapter EVAL-103 is reported (never dropped) as needing --ledger=evm, and the
// provenance names the adapter. The EVM run itself is evals/harness/evm.evm.test.ts (needs Anvil).

describe('--ledger', () => {
  it('defaults to hashchain, takes evm, refuses anything else', () => {
    expect(parseArgs([]).ledger).toBe('hashchain');
    expect(parseArgs(['--ledger=evm']).ledger).toBe('evm');
    expect(() => parseArgs(['--ledger=mainnet'])).toThrow(/--ledger must be hashchain or evm/);
  });

  it('on hashchain, EVAL-103 is reported as needing --ledger=evm and the provenance says hashchain', async () => {
    const r = await evaluate({ seed: 1, suites: ['harness-proof'], milestone: 'M2', proofSuite: async () => [] });
    expect(r.provenance.ledger).toBe('hashchain');
    const c = r.cases.find((x) => x.id === 'EVAL-103');
    expect(c).toMatchObject({ outcome: 'not_yet_implemented', inMilestoneScope: true });
    expect(c!.notes.join(' ')).toMatch(/--ledger=evm/);
    expect(r.runtime.localChainRpcCalls).toBeUndefined();
  });
});

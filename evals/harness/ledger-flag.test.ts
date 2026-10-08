import { describe, expect, it } from 'vitest';
import { buildCase } from './mutate';
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

  it('under --ledger=evm only the harness chain URL itself is allowed; any other URL, loopback included, is refused and recorded', async () => {
    const chain = 'http://127.0.0.1:59999';
    const r = await evaluate({
      seed: 2,
      suites: ['harness-verifier'],
      ledger: 'evm',
      evmRpcUrl: chain,
      buildCase: async (c, inputs, keys) => {
        if (c.id === 'EVAL-001') {
          for (const url of ['http://127.0.0.1:1/', 'http://127.0.0.1:59998/', 'http://localhost:59999/', 'https://example.invalid/', `${chain}/extra`]) {
            await fetch(url).catch(() => undefined);
          }
          await fetch(chain, { method: 'POST' }).catch(() => undefined); // allowed (nothing listens; refused by the OS)
        }
        return buildCase(c, inputs, keys);
      },
    });
    expect(r.runtime.networkCalls).toEqual(['http://127.0.0.1:1/', 'http://127.0.0.1:59998/', 'http://localhost:59999/', 'https://example.invalid/', `${chain}/extra`]);
    expect(r.runtime.localChainRpcCalls).toBe(1);
    expect(r.criticalConditions.map((f) => f.id)).toContain('CF-12');
  }, 60_000);
});

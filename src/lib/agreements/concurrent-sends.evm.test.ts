import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { tempDataDir } from '../../../evals/harness/m2/settlement';
import { createRegistryClient } from '../ledger/evm/client';
import { deployRegistry } from '../ledger/evm/deploy';
import { readOperatorKey } from '../ledger/evm/operator-key';
import { agreementChainId, orgAddress } from './attestor-keys';
import { createEscrowChain, type CreateTerms } from './chain';
import { deployEscrow } from './deploy';

// Stage 10 SEC-200 on Anvil: the operator key is shared by the BatchRegistry anchoring loop and every
// agreement action, and each buyer organisation's key by its own approve/fund/refund. Sends from one
// account overlap when two requests (or a request and the anchoring tick) run at once; each must still
// succeed instead of losing the nonce race ("transaction already imported" → ChainError no_answer).

const rpcUrl = inject('anvilRpcUrl');
let data: Awaited<ReturnType<typeof tempDataDir>>;
beforeAll(async () => {
  data = await tempDataDir();
  vi.stubEnv('DATA_DIR', data.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterAll(async () => {
  await data?.cleanup();
});

/** The registry and the escrow deployed with ONE operator key, as the app runs them (EVM_OPERATOR_KEY_PATH). */
async function sharedOperatorWorld() {
  const operatorKeyPath = join(data.dir, 'keys', 'evm-operator.key');
  const { deployment: reg } = await deployRegistry({ rpcUrl, deploymentPath: join(data.dir, 'evm', 'deployment.json'), operatorKeyPath });
  const { deployment: esc } = await deployEscrow({ rpcUrl, deploymentPath: join(data.dir, 'evm', 'agreements.json'), operatorKeyPath });
  const operatorKey = await readOperatorKey(operatorKeyPath);
  // Separate client instances, as the anchoring loop and the Server Actions build their own.
  return { registry: createRegistryClient({ rpcUrl, deployment: reg, operatorKey }), chain: createEscrowChain({ rpcUrl, deployment: esc, operatorKey }) };
}

const outcome = (r: PromiseSettledResult<unknown>) => (r.status === 'fulfilled' ? 'ok' : String((r.reason as Error).message).split('\n')[0]);

describe('concurrent sends from one EVM account (SEC-200)', () => {
  it('ensureBuyer, createAgreement and an anchor from the same operator, all at once, all succeed', async () => {
    const { registry, chain } = await sharedOperatorWorld();
    const fpo = await orgAddress('ORG-SEC200-FPO');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);
    const terms = (n: string, buyerOrg: string): CreateTerms => ({ id: agreementChainId(n), buyerOrg, fpoPayee: fpo, agreedGrams: BigInt(600_000), minGrade: 80, amountPaise: BigInt(100), deadline });

    const results = await Promise.allSettled([
      chain.ensureBuyer('ORG-SEC200-A', BigInt(100)),
      chain.ensureBuyer('ORG-SEC200-B', BigInt(100)),
      chain.createAgreement(terms('AG-SEC20001', 'ORG-SEC200-A')),
      chain.createAgreement(terms('AG-SEC20002', 'ORG-SEC200-B')),
      registry.append(1, 'a'.repeat(64)),
    ]);
    expect(results.map(outcome)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect([await chain.status(agreementChainId('AG-SEC20001')), await chain.status(agreementChainId('AG-SEC20002'))]).toEqual(['created', 'created']);
    expect(await registry.entryHash(1)).toBe('a'.repeat(64));
    expect(await chain.balanceOf('ORG-SEC200-A')).toBeGreaterThan(BigInt(0));
    expect(await chain.balanceOf('ORG-SEC200-B')).toBeGreaterThan(BigInt(0));
  });

  it("one buyer organisation's approve/fund sends for two agreements at once both succeed", async () => {
    const { chain } = await sharedOperatorWorld();
    const fpo = await orgAddress('ORG-SEC200-FPO');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);
    const ids = ['AG-SEC20003', 'AG-SEC20004'].map(agreementChainId);
    await chain.ensureBuyer('ORG-SEC200-C', BigInt(200));
    for (const id of ids) await chain.createAgreement({ id, buyerOrg: 'ORG-SEC200-C', fpoPayee: fpo, agreedGrams: BigInt(600_000), minGrade: 80, amountPaise: BigInt(100), deadline });

    const results = await Promise.allSettled(ids.map((id) => chain.fund('ORG-SEC200-C', id, BigInt(100))));
    expect(results.map(outcome)).toEqual(['ok', 'ok']);
    expect(await Promise.all(ids.map((id) => chain.status(id)))).toEqual(['funded', 'funded']);
  });
});

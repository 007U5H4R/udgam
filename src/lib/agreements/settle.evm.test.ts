import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { fundedAndGraded, settle, settlementWorld, soonDate, tempDataDir, type SettlementWorld } from '../../../evals/harness/m2/settlement';
import { qualityAttestations, settlements } from '../db/schema';
import { agreementChainId, batchIdHash } from './attestor-keys';
import { ChainError } from './chain';
import { createAgreement, fundAgreement, gradeBatch } from './service';

// Review fixes (TASK-26 fix round 1) on Anvil against the real ContractFarming: a release whose DB
// record was lost is recovered from its Settled event and recorded once; the contract refuses to pay
// one batch out under a second agreement.

const rpcUrl = inject('anvilRpcUrl');
const AMOUNT = BigInt(5_000_000);
let data: Awaited<ReturnType<typeof tempDataDir>>;
beforeAll(async () => {
  data = await tempDataDir();
  vi.stubEnv('DATA_DIR', data.dir);
  vi.stubEnv('LEDGER_KEY_PATH', `${data.dir}/keys/ledger.jwk`);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterAll(async () => {
  await data.cleanup();
});
const worlds: SettlementWorld[] = [];
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.cleanup();
});
async function world() {
  const w = await settlementWorld(rpcUrl);
  worlds.push(w);
  return w;
}

describe('settlement review fixes on chain', () => {
  it('a release made on chain but not recorded is recovered on retry and recorded once; the FPO is paid once', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256] });
    const [qa] = await w.db.select().from(qualityAttestations).where(eq(qualityAttestations.agreementId, r.agreementId));
    // the chain call went through, then the process died before the DB write
    const lost = await w.chain.settle({ id: agreementChainId(r.agreementId), batchIdHash: batchIdHash(r.batchId), deliveredGrams: BigInt(512_000), allVerified: true, grade: 90, gradeSig: qa!.eip712Sig as `0x${string}` });
    expect(lost.released).toBe(true);
    const out = await settle(w, r);
    expect(out).toMatchObject({ outcome: 'released', txHash: lost.txHash, blockNumber: lost.blockNumber });
    expect(await w.db.$count(settlements, and(eq(settlements.agreementId, r.agreementId), eq(settlements.outcome, 'released')))).toBe(1);
    expect(await w.balance(r.fpoPayee)).toBe(AMOUNT);
  });

  it('the contract refuses to release a batch already paid out under another agreement', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256] });
    const opts = { chain: async () => w.chain };
    const { agreementId: second } = await createAgreement(
      w.db,
      { buyerOrg: w.buyerOrg, userId: w.buyerUser, values: { fpoOrg: w.fpo.orgId, crop: 'arabica', agreedKg: 500, minGrade: 80, amountPaise: 5_000_000, deadlineDate: soonDate() } },
      opts,
    );
    await fundAgreement(w.db, { buyerOrg: w.buyerOrg, userId: w.buyerUser, agreementId: second }, opts);
    await gradeBatch(w.db, { buyerOrg: w.buyerOrg, userId: w.buyerUser, agreementId: second, batchId: r.batchId, grade: 90 }, opts);
    await settle(w, r);
    const [qa] = await w.db.select().from(qualityAttestations).where(eq(qualityAttestations.agreementId, second));
    const again = await w.chain
      .settle({ id: agreementChainId(second), batchIdHash: batchIdHash(r.batchId), deliveredGrams: BigInt(512_000), allVerified: true, grade: 90, gradeSig: qa!.eip712Sig as `0x${string}` })
      .then(
        () => 'released',
        (e: unknown) => (e instanceof ChainError ? `${e.kind}:${e.reason}` : String(e)),
      );
    expect(again).toBe('turned_away:BatchAlreadyReleased');
    expect(await w.balance(r.fpoPayee)).toBe(AMOUNT);
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
    expect(await w.chain.status(agreementChainId(second))).toBe('funded');
  });
});

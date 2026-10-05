import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { checkFeed } from '../../scorers/independent-verifier/src';
import { agreementChainId, batchIdHash, GRADE_DOMAIN_NAME, GRADE_DOMAIN_VERSION, GRADE_TYPES } from '../../../src/lib/agreements/attestor-keys';
import { ChainError } from '../../../src/lib/agreements/chain';
import { AgreementError } from '../../../src/lib/agreements/service';
import { agreements, ledgerEntries, qualityAttestations, settlements } from '../../../src/lib/db/schema';
import { buildFeed } from '../../../src/lib/ledger/feed';
import { publishedKeys } from '../../../src/lib/ledger/keys';
import { verifyFeed } from '../../../src/lib/ledger/proof';
import { DATASET_GRADE, fundedAndGraded, settle, settleAsStranger, settlementWorld, tempDataDir, type SettlementWorld } from './settlement';

// EVAL-093–099 (TC-084, integration half; technical-plan TSK-25.6) end to end through the settlement
// service against ContractFarming + MockINR on the `evm` project's Anvil. Expected values are the
// dataset's literals: ₹50,000.00 = 5,000,000 paise; 500 kg agreed; minimum B (Very good · 80).

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

const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof AgreementError ? e.code : e instanceof ChainError ? `${e.kind}:${e.reason}` : String(e)),
  );

describe('settlement through the service (EVAL-093–099)', () => {
  it('EVAL-093 releases exactly ₹50,000.00 to the FPO when quantity, grade and verification hold; anchored with its tx; closed', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256] });
    expect(r.funded.escrow).toBe(AMOUNT);
    expect(r.funded.fpo).toBe(BigInt(0));
    const out = await settle(w, r);
    expect(out).toMatchObject({ outcome: 'released', reasons: [] });
    expect(await w.balance(r.fpoPayee)).toBe(AMOUNT);
    expect(await w.balance(w.deployment.escrow)).toBe(BigInt(0));
    const [row] = await w.db.select().from(settlements).where(eq(settlements.id, out.settlementId));
    expect(row).toMatchObject({ outcome: 'released', txHash: out.txHash, deliveredKg: 512, grade: 90, allVerified: true, pickings: 2, verifiedPickings: 2 });
    const [entry] = await w.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, row!.anchorSeq));
    expect(entry!.kind).toBe('settlement');
    expect(JSON.parse(entry!.payload)).toMatchObject({ outcome: 'released', chain: { txHash: out.txHash, blockNumber: out.blockNumber } });
    const [a] = await w.db.select().from(agreements).where(eq(agreements.id, r.agreementId));
    expect(a).toMatchObject({ status: 'settled', closedTxHash: out.txHash, closedAnchorSeq: row!.anchorSeq });
    expect(await w.chain.status(agreementChainId(r.agreementId))).toBe('settled');

    // the batch's proof feed carries the grade and the settlement; both verifiers accept it (S6-lib)
    const feed = await buildFeed(w.db, r.batchId);
    expect(feed!.entries.map((e) => e.kind)).toEqual(expect.arrayContaining(['quality_attestation', 'settlement']));
    expect(feed!.entries.map((e) => e.kind)).not.toContain('agreement_created');
    const keys = await publishedKeys();
    expect(await verifyFeed(feed, keys.keys)).toMatchObject({ ok: true });
    expect(await checkFeed(JSON.parse(JSON.stringify(feed)), keys)).toMatchObject({ ok: true });
  });

  it('EVAL-094 is not released when the batch totals 499.5 kg of 500 kg; the reason names quantity; escrow unchanged', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [250, 249.5] });
    const out = await settle(w, r);
    expect(out.outcome).toBe('not_released');
    expect(out.reasons).toEqual([{ condition: 'quantity', text: 'Delivered 499.5 kg of 500.0 kg agreed (0.5 kg short)' }]);
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
    expect(await w.balance(r.fpoPayee)).toBe(BigInt(0));
    expect((await w.db.select().from(agreements).where(eq(agreements.id, r.agreementId)))[0]!.status).toBe('funded');
  });

  it('EVAL-095 is not released when the buyer signs grade C against a minimum of B; the reason names the grade', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256], grade: DATASET_GRADE.C });
    const out = await settle(w, r);
    expect(out.outcome).toBe('not_released');
    expect(out.reasons).toEqual([{ condition: 'grade', text: 'Graded Good · 70; minimum Very good · 80' }]);
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
  });

  it('EVAL-096 is not released when an included event is Needs Review (forced in this test DB); the reason names verification', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256], forceNeedsReview: true });
    const out = await settle(w, r);
    expect(out.outcome).toBe('not_released');
    expect(out.reasons).toEqual([{ condition: 'all_verified', text: '1 of 2 pickings Verified' }]);
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
    const [row] = await w.db.select().from(settlements).where(eq(settlements.id, out.settlementId));
    expect(row).toMatchObject({ allVerified: false, verifiedPickings: 1, pickings: 2 });
  });

  it('EVAL-097 a second settlement of a settled agreement is refused and the money moves once', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256] });
    await settle(w, r);
    expect(await code(settle(w, r))).toBe('wrong_state');
    // and the contract itself refuses a replayed settle call
    const [qa] = await w.db.select().from(qualityAttestations).where(eq(qualityAttestations.agreementId, r.agreementId));
    const replay = w.chain.settle({ id: agreementChainId(r.agreementId), batchIdHash: batchIdHash(r.batchId), deliveredGrams: BigInt(512_000), allVerified: true, grade: 90, gradeSig: qa!.eip712Sig as `0x${string}` });
    expect(await code(replay)).toBe('turned_away:WrongStatus');
    expect(await w.balance(r.fpoPayee)).toBe(AMOUNT);
    expect(await w.db.$count(settlements, eq(settlements.agreementId, r.agreementId))).toBe(1);
  });

  it('EVAL-098 settle from an address other than the operator reverts; escrow unchanged', async () => {
    const w = await world();
    const r = await fundedAndGraded(w, { kgs: [256, 256] });
    const [qa] = await w.db.select().from(qualityAttestations).where(eq(qualityAttestations.agreementId, r.agreementId));
    expect(await settleAsStranger(w, r, qa!.eip712Sig as `0x${string}`)).toBe('NotOperator');
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
  });

  it('EVAL-099 a grade whose signature does not verify with the buyer key is refused before settlement; nothing is anchored', async () => {
    const w = await world();
    const forger = privateKeyToAccount(generatePrivateKey());
    const before = await w.db.$count(ledgerEntries);
    const err = await code(
      fundedAndGraded(w, {
        kgs: [256, 256],
        sign: (_org, m, d) =>
          forger.signTypedData({ domain: { name: GRADE_DOMAIN_NAME, version: GRADE_DOMAIN_VERSION, chainId: d.chainId, verifyingContract: d.contract }, types: GRADE_TYPES, primaryType: 'QualityGrade', message: m }),
      }),
    );
    expect(err).toBe('bad_signature');
    expect(await w.db.$count(qualityAttestations)).toBe(0);
    expect(await w.db.$count(ledgerEntries, eq(ledgerEntries.kind, 'quality_attestation'))).toBe(0);
    expect(await w.db.$count(ledgerEntries)).toBeGreaterThan(before); // the agreement, funding, batch and custody were anchored, not a grade

    // and on chain a forged grade signature is turned away before any condition is judged
    const [a] = await w.db.select().from(agreements);
    const forged = await forger.signTypedData({
      domain: { name: GRADE_DOMAIN_NAME, version: GRADE_DOMAIN_VERSION, chainId: w.deployment.chainId, verifyingContract: w.deployment.escrow },
      types: GRADE_TYPES,
      primaryType: 'QualityGrade',
      message: { agreementId: a!.chainIdHex as `0x${string}`, batchIdHash: batchIdHash('B-ANY'), grade: 90 },
    });
    expect(await code(w.chain.settle({ id: a!.chainIdHex as `0x${string}`, batchIdHash: batchIdHash('B-ANY'), deliveredGrams: BigInt(512_000), allVerified: true, grade: 90, gradeSig: forged }))).toBe(
      'turned_away:BadGradeSignature',
    );
    expect(await w.balance(w.deployment.escrow)).toBe(AMOUNT);
  });
});

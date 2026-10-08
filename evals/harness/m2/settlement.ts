import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { agreementChainId, batchIdHash, orgAddress } from '../../../src/lib/agreements/attestor-keys';
import { createEscrowChain, FARMING_ABI, TOKEN_ABI, toChainError, type EscrowChain } from '../../../src/lib/agreements/chain';
import { deployEscrow } from '../../../src/lib/agreements/deploy';
import type { EscrowDeployment } from '../../../src/lib/agreements/deployment';
import { istToday } from '../../../src/lib/agreements/format';
import type { Grade } from '../../../src/lib/agreements/grades';
import { createAgreement, fundAgreement, gradeBatch, type GradeSigner } from '../../../src/lib/agreements/service';
import { settleBatch } from '../../../src/lib/agreements/settle';
import { createBatch } from '../../../src/lib/batches/create';
import { transferBatch } from '../../../src/lib/custody/transfer';
import { writeTx } from '../../../src/lib/db/client';
import { user } from '../../../src/lib/db/schema';
import { newId } from '../../../src/lib/ids';
import { readOperatorKey } from '../../../src/lib/ledger/evm/operator-key';

// M-002 settlement runners (technical-plan TSK-25.6; EVAL-093–099, TC-084 integration half). Each case
// runs end to end through the real services against a ContractFarming + MockINR deployed for it alone on
// a local Anvil: a buyer creates and funds an agreement in mock INR, the FPO's Verified pickings are
// batched and handed to the buyer, the buyer grades the batch (EIP-712, server-held org key), and the
// FPO admin settles. The vitest file evals/harness/m2/settlement.evm.test.ts titles each test with its
// EVAL id (`pnpm test:evm`). Requires DATA_DIR to point at a temp dir (keys are written there).
//
// The dataset words grades A/B/C; the shipped scale is labels (Design.md §28.3, D9), mapped here as
// A → Excellent 90, B → Very good 80, C → Good 70.

export const DATASET_GRADE = { A: 90, B: 80, C: 70 } as const satisfies Record<string, Grade>;

export type SettlementWorld = TempDb & {
  rpcUrl: string;
  deployment: EscrowDeployment;
  chain: EscrowChain;
  fpo: FpoWorld;
  buyerOrg: string;
  buyerUser: string;
  operatorKey: Hex;
  /** Mock INR (paise) held by an address. */
  balance(address: Address): Promise<bigint>;
};

export async function settlementWorld(rpcUrl: string): Promise<SettlementWorld> {
  const t = await tempDb();
  try {
    const operatorKeyPath = join(t.dir, 'keys', 'evm-operator.key');
    const { deployment } = await deployEscrow({ rpcUrl, deploymentPath: join(t.dir, 'evm', 'agreements.json'), operatorKeyPath });
    const operatorKey = await readOperatorKey(operatorKeyPath);
    const chain = createEscrowChain({ rpcUrl, deployment, operatorKey });
    const fpo = await seedFpo(t.db);
    const buyerOrg = await seedBuyer(t.db);
    const buyerUser = newId('USR-');
    await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@buyer.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
    const pub = createPublicClient({ transport: http(rpcUrl) });
    const balance = (address: Address) => pub.readContract({ address: deployment.token, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>;
    return { ...t, rpcUrl, deployment, chain, fpo, buyerOrg, buyerUser, operatorKey, balance };
  } catch (e) {
    await t.cleanup();
    throw e;
  }
}

/** A date a few days after today in IST (the agreement deadline input). */
export const soonDate = (days = 30): string => {
  const d = new Date(`${istToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type CaseSetup = {
  /** Picking weights in the delivered batch (each a multiple of 0.5 kg). */
  kgs: number[];
  agreedKg?: number;
  minGrade?: Grade;
  grade?: Grade;
  amountPaise?: number;
  /** Force one member's final verdict to Needs Review after batching (test DB only, EVAL-096). */
  forceNeedsReview?: boolean;
  sign?: GradeSigner;
};

export type CaseRun = {
  agreementId: string;
  batchId: string;
  fpoPayee: Address;
  /** Escrow, FPO and buyer balances after funding. */
  funded: { escrow: bigint; fpo: bigint; buyer: bigint };
};

/** EVAL-093's agreement (500 kg, minimum B, ₹50,000.00), funded, with a delivered batch graded by the buyer. */
export async function fundedAndGraded(w: SettlementWorld, s: CaseSetup): Promise<CaseRun> {
  const { agreementId } = await createAgreement(
    w.db,
    {
      buyerOrg: w.buyerOrg,
      userId: w.buyerUser,
      values: { fpoOrg: w.fpo.orgId, crop: 'arabica', agreedKg: s.agreedKg ?? 500, minGrade: s.minGrade ?? DATASET_GRADE.B, amountPaise: s.amountPaise ?? 5_000_000, deadlineDate: soonDate() },
    },
    { chain: async () => w.chain },
  );
  await fundAgreement(w.db, { buyerOrg: w.buyerOrg, userId: w.buyerUser, agreementId }, { chain: async () => w.chain });
  const caps = [];
  for (const kg of s.kgs) caps.push(await seedCapture(w.db, w.fpo, { kg }));
  const { batchId } = await createBatch(w.db, { orgId: w.fpo.orgId, adminId: w.fpo.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
  await transferBatch(w.db, { orgId: w.fpo.orgId, adminId: w.fpo.adminId, batchId, toOrgId: w.buyerOrg });
  if (s.forceNeedsReview) {
    // Batch triggers normally make this impossible (only Verified events can be batched): force it in
    // this test DB by dropping the guard, as EVAL-096 specifies.
    await w.client.execute('DROP TRIGGER IF EXISTS harvest_events_batched_frozen');
    await w.client.execute({ sql: "UPDATE harvest_events SET final_verdict = 'Needs Review' WHERE id = ?", args: [caps[0]!.eventId] });
  }
  await gradeBatch(w.db, { buyerOrg: w.buyerOrg, userId: w.buyerUser, agreementId, batchId, grade: s.grade ?? DATASET_GRADE.A }, { chain: async () => w.chain, sign: s.sign });
  const fpoPayee = await orgAddress(w.fpo.orgId);
  return {
    agreementId,
    batchId,
    fpoPayee,
    funded: { escrow: await w.balance(w.deployment.escrow), fpo: await w.balance(fpoPayee), buyer: await w.balance(await orgAddress(w.buyerOrg)) },
  };
}

export const settle = (w: SettlementWorld, r: Pick<CaseRun, 'agreementId' | 'batchId'>) =>
  settleBatch(w.db, { fpoOrg: w.fpo.orgId, userId: w.fpo.adminId, agreementId: r.agreementId, batchId: r.batchId }, { chain: async () => w.chain });

/** Call settle on the contract from an account that is not the operator (EVAL-098); resolves to the revert's error name. */
export async function settleAsStranger(w: SettlementWorld, r: CaseRun, gradeSig: Hex): Promise<string> {
  const stranger = privateKeyToAccount(generatePrivateKey());
  const pub = createPublicClient({ transport: http(w.rpcUrl) });
  // fund the stranger with gas from the operator so a real transaction could be sent
  const op = privateKeyToAccount(w.operatorKey);
  const hash = await createWalletClient({ account: op, transport: http(w.rpcUrl) }).sendTransaction({ account: op, to: stranger.address, value: parseEther('1'), chain: null });
  await pub.waitForTransactionReceipt({ hash });
  try {
    await pub.simulateContract({
      account: stranger,
      address: w.deployment.escrow,
      abi: FARMING_ABI,
      functionName: 'settle',
      args: [agreementChainId(r.agreementId), batchIdHash(r.batchId), BigInt(512_000), true, 90, gradeSig],
    });
    return 'no revert';
  } catch (e) {
    return toChainError(e).reason;
  }
}

/** A temp DATA_DIR for keys (user signing keys and org EVM keys). */
export async function tempDataDir(): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'udgam-m2-data-'));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

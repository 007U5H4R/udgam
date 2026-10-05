import { eq } from 'drizzle-orm';
import type { Db } from '../../../src/lib/db/client';
import { ledgerEntries, processingSteps } from '../../../src/lib/db/schema';
import { buildFeed } from '../../../src/lib/ledger/feed';
import { publishedKeys } from '../../../src/lib/ledger/keys';
import { verifyFeed, type ProofFeedV1 } from '../../../src/lib/ledger/proof';
import type { Process } from '../../../src/lib/processing/config';
import { recordProcessingStep, type RecordedStep } from '../../../src/lib/processing/actions';
import { seedProcessingWorld, type ProcessingWorld } from '../../../tests/helpers/processing-world';

// EVAL-100–102 (M2, suite `integration`, TC-086): the processor mass-balance flows, run end to end
// through the processing action (technical-plan TSK-26.4) on a real database: record the step, then
// read back its row, its `processing_step` ledger entry and the batch's proof feed, and check the feed
// in the same verifier the certificate runs. The inputs are fixed literals from the dataset's cases;
// mass-balance.int.test.ts asserts each case's expected behaviour and failure conditions under its ID.

export type MassBalanceCaseId = 'EVAL-100' | 'EVAL-101' | 'EVAL-102';

export const MASS_BALANCE_CASES: Record<MassBalanceCaseId, { process: Process; inputKg: number; outputKg: number; expected: 'ok' | 'flag' }> = {
  // "A processor records pulping of 1,000 kg cherry into an output inside the configured band."
  'EVAL-100': { process: 'pulping', inputKg: 1000, outputKg: 420, expected: 'ok' },
  // "Output below the band's lower bound for the process."
  'EVAL-101': { process: 'hulling_parchment', inputKg: 600, outputKg: 420, expected: 'flag' },
  // "Output above the band's upper bound for the process, including output kg greater than input kg."
  'EVAL-102': { process: 'hulling_parchment', inputKg: 600, outputKg: 650, expected: 'flag' },
};

export type MassBalanceFlow = {
  world: ProcessingWorld;
  step: RecordedStep;
  row: typeof processingSteps.$inferSelect;
  /** The anchored ledger entry's kind and payload. */
  entry: { kind: string; payload: Record<string, unknown> };
  feed: ProofFeedV1;
  /** The feed as served, checked by the certificate's verifier with the published ledger key. */
  feedOk: boolean;
};

/** Run one case's flow on `db` (a migrated database; DATA_DIR and LEDGER_KEY_PATH set by the caller). */
export async function runMassBalanceFlow(db: Db, id: MassBalanceCaseId): Promise<MassBalanceFlow> {
  const c = MASS_BALANCE_CASES[id];
  const world = await seedProcessingWorld(db, { processorName: 'Processor C-03' });
  const step = await recordProcessingStep(db, { orgId: world.processorOrg, userId: world.processorUserId, batchId: world.batchId, process: c.process, inputKg: c.inputKg, outputKg: c.outputKg });
  const [row] = await db.select().from(processingSteps).where(eq(processingSteps.id, step.stepId));
  const [e] = await db.select({ kind: ledgerEntries.kind, payload: ledgerEntries.payload }).from(ledgerEntries).where(eq(ledgerEntries.seq, step.anchorSeq));
  const feed = (await buildFeed(db, world.batchId)) as ProofFeedV1;
  const verdict = await verifyFeed(feed, (await publishedKeys()).keys);
  return { world, step, row: row!, entry: { kind: e!.kind, payload: JSON.parse(e!.payload) as Record<string, unknown> }, feed, feedOk: verdict.ok };
}

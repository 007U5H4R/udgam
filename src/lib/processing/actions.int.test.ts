import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { seedProcessingWorld, seedProcessorOrg, type ProcessingWorld } from '../../../tests/helpers/processing-world';
import { getUserPublicKey } from '../auth/signing-keys';
import { listBuyerBatches } from '../batches/buyer';
import { jwkThumbprint, verify } from '../crypto';
import { custodyTransfers, ledgerEntries, processingSteps } from '../db/schema';
import { buildFeed } from '../ledger/feed';
import { publishedKeys } from '../ledger/keys';
import { payloadStatement, verifyFeed } from '../ledger/proof';
import { MB_CONFIG_HASH } from './config';
import { handOnBatch, ProcessingError, recordProcessingStep } from './actions';
import { getProcessorBatch, listProcessorBatches } from './read';

// TSK-26.4 (TC-086): the processing action records the step, runs the mass balance, signs on behalf of
// the processor's account (kid = RFC 7638 thumbprint, publicJwk exactly {kty, crv, x, y}) and anchors it,
// all in one transaction; the hand-on is a signed custody_transfer to a buyer. Refusals write nothing.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-processing-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: ProcessingWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedProcessingWorld(t.db, { processorName: 'Processor C-03' });
});
afterEach(async () => {
  await t.cleanup();
});

const record = (o: Partial<Parameters<typeof recordProcessingStep>[1]> = {}) =>
  recordProcessingStep(t.db, { orgId: w.processorOrg, userId: w.processorUserId, batchId: w.batchId, process: 'hulling_parchment', inputKg: 600, outputKg: 480, ...o }, () => new Date('2026-10-01T04:35:00.000Z'));
const handOn = (o: Partial<Parameters<typeof handOnBatch>[1]> = {}) => handOnBatch(t.db, { orgId: w.processorOrg, userId: w.processorUserId, batchId: w.batchId, toOrgId: w.buyerOrg, ...o });

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ProcessingError);
  expect((err as ProcessingError).code).toBe(code);
}
const counts = async () => ({ ledger: await t.db.$count(ledgerEntries), steps: await t.db.$count(processingSteps), custody: await t.db.$count(custodyTransfers) });

describe('recordProcessingStep (TSK-26.4)', () => {
  it('signs the step on behalf of the processor, anchors it as processing_step and records the row', async () => {
    const out = await record();
    expect(out).toMatchObject({ status: 'ok', ratio: 80, band: [75, 85], recordedAt: '2026-10-01T04:35:00.000Z' });
    const [entry] = await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, out.anchorSeq));
    expect(entry!.kind).toBe('processing_step');
    const payload = JSON.parse(entry!.payload) as Record<string, unknown> & { publicJwk: JsonWebKey; kid: string; signature: string };
    expect(payload).toMatchObject({
      v: 1,
      stepId: out.stepId,
      batchId: w.batchId,
      processorOrg: w.processorOrg,
      processorName: 'Processor C-03',
      userId: w.processorUserId,
      process: 'hulling_parchment',
      crop: 'arabica',
      inputKg: 600,
      outputKg: 480,
      ratio: 80,
      band: [75, 85],
      status: 'ok',
      evidence: 'Output 480.0 kg is 80.0% of input 600.0 kg (expected 75–85% for hulling parchment).',
      configVersion: 'mb-1',
      configHash: MB_CONFIG_HASH,
      ts: '2026-10-01T04:35:00.000Z',
    });
    // kid = thumbprint; publicJwk exactly {kty, crv, x, y}; no forbidden keys (docs/proof-feed.md §9.2)
    expect(Object.keys(payload.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(payload.kid).toBe(await jwkThumbprint(payload.publicJwk));
    expect(payload.kid).toBe((await getUserPublicKey(w.processorUserId)).kid);
    expect(await verify(payload.publicJwk, payloadStatement(payload), payload.signature)).toBe(true);

    const [row] = await t.db.select().from(processingSteps).where(eq(processingSteps.id, out.stepId));
    expect(row).toMatchObject({ batchId: w.batchId, processorOrg: w.processorOrg, userId: w.processorUserId, signature: payload.signature, keyId: payload.kid, anchorSeq: out.anchorSeq });
  });

  it('a flagged step is recorded like any other (nothing is refused)', async () => {
    const out = await record({ outputKg: 650 });
    expect(out.status).toBe('flag');
    expect(await t.db.$count(processingSteps)).toBe(1);
  });

  it('the proof feed carries the step and verifies; a changed step fails the check', async () => {
    await record();
    const feed = await buildFeed(t.db, w.batchId);
    const keys = (await publishedKeys()).keys;
    expect(feed.entries.filter((e) => e.kind === 'processing_step')).toHaveLength(1);
    expect(await verifyFeed(feed, keys)).toMatchObject({ ok: true });
    // The payload is hashed under a signed checkpoint: any change to the step, its signature included,
    // fails (a forged signature over unchanged bytes fails at payload-signature: independent-verifier §9.2 test).
    const other = structuredClone(feed);
    const step = other.entries.find((e) => e.kind === 'processing_step')!;
    const transfer = other.entries.find((e) => e.kind === 'custody_transfer')!;
    step.payload = { ...step.payload, signature: transfer.payload.signature };
    expect(await verifyFeed(other, keys)).toMatchObject({ ok: false, step: 'payload-hash' });
  });

  it('another processor, or the FPO, cannot record on the batch: not_found, nothing written', async () => {
    const p2 = await seedProcessorOrg(t.db);
    const before = await counts();
    await expectCode(record({ orgId: p2.orgId, userId: p2.userId }), 'not_found');
    await expectCode(record({ orgId: w.fpo.orgId, userId: w.fpo.adminId }), 'not_found');
    await expectCode(record({ batchId: 'B-NOPE0000' }), 'not_found');
    expect(await counts()).toEqual(before);
  });

  it('a second step → already_recorded; after the hand-on → not_held; nothing written', async () => {
    await record();
    await expectCode(record({ process: 'drying' }), 'already_recorded');
    await handOn();
    const before = await counts();
    await expectCode(record(), 'not_held');
    expect(await counts()).toEqual(before);
  });
});

describe('handOnBatch (TSK-26.3/26.4)', () => {
  it('hands the batch on to a buyer: signed custody_transfer, the buyer now holds it, the feed verifies', async () => {
    await record();
    const out = await handOn();
    const [row] = await t.db.select().from(custodyTransfers).where(eq(custodyTransfers.id, out.transferId));
    expect(row).toMatchObject({ batchId: w.batchId, fromOrg: w.processorOrg, toOrg: w.buyerOrg, adminId: w.processorUserId, keyId: (await getUserPublicKey(w.processorUserId)).kid });
    expect((await listBuyerBatches(t.db, w.buyerOrg)).map((b) => b.batchId)).toEqual([w.batchId]);
    const feed = await buildFeed(t.db, w.batchId);
    expect(feed.entries.filter((e) => e.kind === 'custody_transfer').map((e) => [e.payload.fromOrg, e.payload.toOrg])).toEqual([
      [w.fpo.orgId, w.processorOrg],
      [w.processorOrg, w.buyerOrg],
    ]);
    expect(await verifyFeed(feed, (await publishedKeys()).keys)).toMatchObject({ ok: true });
  });

  it('refuses before a step (no_step), to a non-buyer (not_buyer), twice (not_held), and by a stranger (not_found)', async () => {
    await expectCode(handOn(), 'no_step');
    await record();
    await expectCode(handOn({ toOrgId: (await seedProcessorOrg(t.db)).orgId }), 'not_buyer');
    await expectCode(handOn({ toOrgId: w.fpo.orgId }), 'not_buyer');
    const p2 = await seedProcessorOrg(t.db);
    await expectCode(handOn({ orgId: p2.orgId, userId: p2.userId }), 'not_found');
    await handOn();
    const before = await counts();
    await expectCode(handOn({ toOrgId: await seedBuyer(t.db) }), 'not_held');
    expect(await counts()).toEqual(before);
  });
});

describe('processor reads (TSK-26.5)', () => {
  it('lists batches handed to this processor with its step and hand-on; another processor sees nothing', async () => {
    let [b] = await listProcessorBatches(t.db, w.processorOrg);
    expect(b).toMatchObject({ batchId: w.batchId, crop: 'arabica', quantityKg: 82.5, pickings: 2, fromOrgName: w.fpo.orgName, held: true, step: null, handedOn: null });
    await record();
    await handOn();
    [b] = await listProcessorBatches(t.db, w.processorOrg);
    expect(b).toMatchObject({ held: false, step: { process: 'hulling_parchment', status: 'ok', ratio: 80, band: [75, 85] }, handedOn: { byName: 'Ravi P.' } });
    const p2 = await seedProcessorOrg(t.db);
    expect(await listProcessorBatches(t.db, p2.orgId)).toEqual([]);
    expect(await getProcessorBatch(t.db, p2.orgId, w.batchId)).toBeNull();
    expect(await getProcessorBatch(t.db, w.processorOrg, w.batchId)).toMatchObject({ batchId: w.batchId });
  });
});

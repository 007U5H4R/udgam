import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { transferBatch } from '../custody/transfer';
import { getBuyerBatch, listBuyerBatches } from './buyer';
import { createBatch, type CreatedBatch } from './create';

// TSK-14.6 (TC-060, EVAL-080, TC-019 batch part): a buyer sees only the batches whose latest custody
// transfer is to its organisation, with score, quantity, plots (producer IDs, never farmer names) and
// the custody chain.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-buyer-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let b: CreatedBatch;
let buyerA: string;
let buyerB: string;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
  const caps = [await seedCapture(t.db, w, { kg: 40, score: 91.5 }), await seedCapture(t.db, w, { kg: 42.5, score: 84 }), await seedCapture(t.db, w, { kg: 46, score: 97 })];
  b = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
  buyerA = await seedBuyer(t.db);
  buyerB = await seedBuyer(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

describe('listBuyerBatches / getBuyerBatch', () => {
  it('buyer A lists its batch with score, quantity, plot count, producer IDs and custody chain', async () => {
    expect(await listBuyerBatches(t.db, buyerA)).toEqual([]); // not transferred yet
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyerA });

    const list = await listBuyerBatches(t.db, buyerA);
    expect(list).toEqual([
      {
        batchId: b.batchId,
        crop: 'arabica',
        quantityKg: 128.5,
        integrityScore: 84,
        plotCount: 1,
        shortHash: b.shortHash,
        fromOrgName: `FPO ${w.orgId}`,
        transferredAt: expect.stringMatching(/Z$/),
      },
    ]);

    const detail = await getBuyerBatch(t.db, buyerA, b.batchId);
    expect(detail).toMatchObject({ batchId: b.batchId, crop: 'arabica', quantityKg: 128.5, integrityScore: 84, plotCount: 1, shortHash: b.shortHash });
    expect(detail!.plots).toEqual([{ plotId: w.plots.arabica.plotId, producerId: w.plots.arabica.producerId, pickings: 3, cherryKg: 128.5 }]);
    expect(detail!.custody).toEqual([
      { fromOrgId: w.orgId, fromOrgName: `FPO ${w.orgId}`, toOrgId: buyerA, toOrgName: `buyer ${buyerA}`, transferredAt: expect.any(String), keyId: expect.any(String) },
    ]);
    expect(JSON.stringify(detail)).not.toContain('Test farmer'); // producer IDs only (EV16)
  });

  it("buyer B's list is empty and B cannot open A's batch (EVAL-080)", async () => {
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyerA });
    expect(await listBuyerBatches(t.db, buyerB)).toEqual([]);
    expect(await getBuyerBatch(t.db, buyerB, b.batchId)).toBeNull();
    expect(await getBuyerBatch(t.db, buyerA, 'B-NOPE0000')).toBeNull();
    // the FPO that made it is not a buyer of it
    expect(await getBuyerBatch(t.db, w.orgId, b.batchId)).toBeNull();
  });

  it('an open batch is visible to no buyer', async () => {
    expect(await getBuyerBatch(t.db, buyerA, b.batchId)).toBeNull();
    expect(await listBuyerBatches(t.db, buyerA)).toEqual([]);
  });
});

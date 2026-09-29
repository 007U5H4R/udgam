import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { transferBatch } from '../custody/transfer';
import { createBatch } from './create';
import { getOrgBatch, listBuyerOrgs, listOrgBatches } from './read';

// TSK-14.5 reads (TC-019 batch part, EVAL-080): an admin sees only their org's batches.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-batch-read-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

describe('admin batch reads', () => {
  it("lists the org's batches newest first with status, crop, kg, score and pickings; detail has members and custody", async () => {
    const a1 = await seedCapture(t.db, w, { kg: 40, score: 91.5 });
    const a2 = await seedCapture(t.db, w, { kg: 42.5, score: 84 });
    const r1 = await seedCapture(t.db, w, { crop: 'robusta', kg: 30, score: 95 });
    const first = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a1.eventId, a2.eventId] });
    await new Promise((r) => setTimeout(r, 5));
    const second = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'robusta', eventIds: [r1.eventId] });
    const buyer = await seedBuyer(t.db);
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: first.batchId, toOrgId: buyer });

    const list = await listOrgBatches(t.db, w.orgId);
    expect(list.map((b) => b.batchId)).toEqual([second.batchId, first.batchId]);
    expect(list[1]).toEqual({
      batchId: first.batchId,
      crop: 'arabica',
      status: 'transferred',
      quantityKg: 82.5,
      integrityScore: 84,
      pickings: 2,
      shortHash: first.shortHash,
      createdAt: expect.any(String),
    });
    expect(list[0]).toMatchObject({ crop: 'robusta', status: 'open', quantityKg: 30, integrityScore: 95, pickings: 1 });

    const detail = await getOrgBatch(t.db, w.orgId, first.batchId);
    expect(detail!.members.map((m) => m.eventId)).toEqual([a1.eventId, a2.eventId].sort());
    expect(detail!.members.find((m) => m.eventId === a1.eventId)).toEqual({
      eventId: a1.eventId,
      plotName: w.plots.arabica.plotId,
      producerId: w.plots.arabica.producerId,
      cherryKg: 40,
      score: 91.5,
      receivedAt: expect.any(String),
    });
    expect(detail!.custody).toEqual([{ fromOrgId: w.orgId, fromOrgName: `FPO ${w.orgId}`, toOrgId: buyer, toOrgName: `buyer ${buyer}`, transferredAt: expect.any(String), keyId: expect.any(String) }]);
    expect(JSON.stringify(detail)).not.toContain('Test farmer');
  });

  it("another org's batch is null, like an unknown one, and is not listed (TC-019, EVAL-080)", async () => {
    const other = await seedFpo(t.db);
    const c = await seedCapture(t.db, other, { kg: 40 });
    const theirs = await createBatch(t.db, { orgId: other.orgId, adminId: other.adminId, crop: 'arabica', eventIds: [c.eventId] });
    expect(await getOrgBatch(t.db, w.orgId, theirs.batchId)).toBeNull();
    expect(await getOrgBatch(t.db, w.orgId, 'B-NOPE0000')).toBeNull();
    expect(await listOrgBatches(t.db, w.orgId)).toEqual([]);
    expect(await getOrgBatch(t.db, other.orgId, theirs.batchId)).not.toBeNull();
  });

  it('lists only buyer organisations as transfer targets', async () => {
    const buyer = await seedBuyer(t.db);
    await seedBuyer(t.db, 'fpo');
    await seedBuyer(t.db, 'processor');
    expect((await listBuyerOrgs(t.db)).map((o) => o.id)).toEqual([buyer]);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from './create';
import { listEligibleEvents } from './eligible';

// TSK-14.3: the builder lists only the org's Verified pickings that are in no batch yet.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-eligible-'));
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

describe('listEligibleEvents', () => {
  it("lists the org's final-Verified pickings that are in no batch, with plot, producer, crop, kg, score and time", async () => {
    const a = await seedCapture(t.db, w, { crop: 'arabica', kg: 40, score: 91.5 });
    const r = await seedCapture(t.db, w, { crop: 'robusta', kg: 22.5, score: 88 });
    await seedCapture(t.db, w, { crop: 'arabica', kg: 30, verdict: 'Needs Review', score: 70 });
    await seedCapture(t.db, w, { crop: 'arabica', kg: 30, verdict: 'Rejected', score: 20 });
    const other = await seedFpo(t.db);
    await seedCapture(t.db, other, { crop: 'arabica', kg: 50 });

    const list = await listEligibleEvents(t.db, w.orgId);
    expect(list.map((e) => e.eventId).sort()).toEqual([a.eventId, r.eventId].sort());
    const row = list.find((e) => e.eventId === a.eventId)!;
    expect(row).toEqual({
      eventId: a.eventId,
      plotName: w.plots.arabica.plotId,
      producerId: w.plots.arabica.producerId,
      crop: 'arabica',
      cherryKg: 40,
      score: 91.5,
      receivedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(Object.keys(row)).not.toContain('farmerName');
  });

  it('filters by crop', async () => {
    const a = await seedCapture(t.db, w, { crop: 'arabica', kg: 40 });
    const r = await seedCapture(t.db, w, { crop: 'robusta', kg: 22.5 });
    expect((await listEligibleEvents(t.db, w.orgId, 'arabica')).map((e) => e.eventId)).toEqual([a.eventId]);
    expect((await listEligibleEvents(t.db, w.orgId, 'robusta')).map((e) => e.eventId)).toEqual([r.eventId]);
  });

  it('drops a picking once it is in a batch', async () => {
    const a = await seedCapture(t.db, w, { kg: 40 });
    const b = await seedCapture(t.db, w, { kg: 42.5 });
    await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] });
    expect((await listEligibleEvents(t.db, w.orgId)).map((e) => e.eventId)).toEqual([b.eventId]);
  });

  it('lists newest first and is empty for an org with nothing eligible', async () => {
    const first = await seedCapture(t.db, w, { kg: 40 });
    await new Promise((r) => setTimeout(r, 5));
    const second = await seedCapture(t.db, w, { kg: 42.5 });
    expect((await listEligibleEvents(t.db, w.orgId)).map((e) => e.eventId)).toEqual([second.eventId, first.eventId]);
    expect(await listEligibleEvents(t.db, 'ORG-NOBODY')).toEqual([]);
  });
});

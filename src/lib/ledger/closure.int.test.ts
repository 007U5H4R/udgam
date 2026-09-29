import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBatchWorld, seedRejectedCapture } from '../../../tests/helpers/batch-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { closureSeqs } from './closure';

// TC-063 (closure part): the provenance closure of a batch (evaluation-plan §4.6), computed from
// the ledger, equals a list assembled here independently from the tables' anchor_seq columns (plus
// the recorded anchors of kinds that have no table yet) and the two JSON-matched kinds.

const keyDir = mkdtempSync(join(tmpdir(), 'udgam-closure-key-'));
vi.stubEnv('LEDGER_KEY_PATH', join(keyDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(keyDir, { recursive: true, force: true }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const ints = (rows: { [k: string]: unknown }[], col = 's') => rows.map((r) => Number(r[col]));
const inList = (ids: string[]) => ids.map((id) => `'${id}'`).join(',');

describe('closureSeqs (TC-063 closure)', () => {
  it('lists exactly the batch, its custody, events, runs, override, plots (with edits and attestations) and devices', async () => {
    const w = await seedBatchWorld(t.db, { events: 3, plots: 2, devices: 2, editPlot: true, attestation: true, override: true, transfer: true, revokeDevice: true });
    // noise: another batch in the same FPO on other plots/devices, and a rejected capture naming this batch's plot
    const other = await seedBatchWorld(t.db, { events: 2, plots: 1, devices: 1, editPlot: true, transfer: true, orgId: w.orgId });
    expect(await seedRejectedCapture(t.db, w.plotIds[0]!, w.deviceIds[0]!)).not.toBeNull();

    const q = async (sql: string) => ints((await t.client.execute(sql)).rows as never);
    const expected = new Set<number>([
      ...(await q(`SELECT anchor_seq AS s FROM plots WHERE id IN (${inList(w.plotIds)})`)),
      ...(await q(`SELECT anchor_seq AS s FROM devices WHERE id IN (${inList(w.deviceIds)})`)),
      ...(await q(`SELECT anchor_seq AS s FROM harvest_events WHERE id IN (${inList(w.eventIds)})`)),
      ...(await q(`SELECT anchor_seq AS s FROM verification_runs WHERE event_id IN (${inList(w.eventIds)})`)),
      // no batches/custody/overrides/attestations tables yet (TKT-12/13/14): their recorded anchors
      w.anchors.batchCreated.seq,
      ...w.anchors.custody.map((a) => a.seq),
      ...w.anchors.overrides.map((a) => a.seq),
      ...w.anchors.attestations.map((a) => a.seq),
      // the two kinds found by JSON match
      ...(await q(`SELECT seq AS s FROM ledger_entries WHERE kind = 'plot_edited' AND json_extract(payload, '$.plotId') IN (${inList(w.plotIds)})`)),
      ...(await q(`SELECT seq AS s FROM ledger_entries WHERE kind = 'device_revoked' AND json_extract(payload, '$.deviceId') IN (${inList(w.deviceIds)})`)),
    ]);
    // 2 plots + 1 edit + 1 attestation + 2 devices + 1 revocation + 3 events + 3 runs + 1 override + batch + transfer
    expect(expected.size).toBe(16);

    const got = await closureSeqs(t.db, w.batchId);
    expect(got).toEqual([...expected].sort((a, b) => a - b));

    // nothing of the other batch, and not the rejected capture
    const otherSeqs = new Set(await closureSeqs(t.db, other.batchId));
    expect(got.filter((s) => otherSeqs.has(s))).toEqual([]);
    const rejected = await q(`SELECT anchor_seq AS s FROM harvest_events WHERE boundary_status = 'rejected'`);
    expect(rejected).toHaveLength(1);
    expect(got).not.toContain(rejected[0]);
  }, 30_000);

  it('is empty for an unknown batch', async () => {
    await seedBatchWorld(t.db, { events: 1, plots: 1 });
    expect(await closureSeqs(t.db, 'B-NOSUCH00')).toEqual([]);
  });
});

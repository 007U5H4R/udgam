import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from '../batches/create';
import { localMediaStore } from '../media/store';
import { attachAttestation } from './attach';
import { batchAttestations } from './for-batch';

// QA-P5-2 / TC-058 (batch half): the batch detail pages show "Certified by {issuer} — certificate on
// record" for each member plot with an attestation on record, the latest one per plot, and only the
// batch org's own attestations (another org's never shows).

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-batch-attest-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const pdf = (body: string) => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
const now = () => new Date('2026-10-05T04:00:00.000Z');

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const attach = (orgId: string, plotId: string, issuer: string, validFrom = '2026-01-01', validTo = '2027-01-01') =>
  attachAttestation(t.db, { orgId, plotId, file: pdf(issuer), issuer, validFrom, validTo }, { store: localMediaStore(t.dir), now });

describe('batchAttestations (QA-P5-2, TC-058 batch detail)', () => {
  it('maps each member plot with an attestation to its latest one; a plot without one is absent', async () => {
    const a = await seedCapture(t.db, w, { kg: 40 });
    const r = await seedCapture(t.db, w, { crop: 'robusta', kg: 30 });
    const ab = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] });
    const rb = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'robusta', eventIds: [r.eventId] });
    expect(await batchAttestations(t.db, ab.batchId)).toEqual(new Map());

    await attach(w.orgId, w.plots.arabica.plotId, 'NPOP body', '2019-01-01', '2020-12-31');
    await attach(w.orgId, w.plots.arabica.plotId, 'INDOCERT');

    const got = await batchAttestations(t.db, ab.batchId);
    expect([...got.keys()]).toEqual([w.plots.arabica.plotId]);
    expect(got.get(w.plots.arabica.plotId)).toMatchObject({ plotId: w.plots.arabica.plotId, issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-01-01' });
    // the robusta batch's plot has no attestation
    expect(await batchAttestations(t.db, rb.batchId)).toEqual(new Map());
  });

  it("another org's attestation never shows on this org's batch", async () => {
    const other = await seedFpo(t.db);
    await attach(other.orgId, other.plots.arabica.plotId, 'Other org certifier');
    const a = await seedCapture(t.db, w, { kg: 40 });
    const mine = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] });
    expect(await batchAttestations(t.db, mine.batchId)).toEqual(new Map());

    const c = await seedCapture(t.db, other, { kg: 40 });
    const theirs = await createBatch(t.db, { orgId: other.orgId, adminId: other.adminId, crop: 'arabica', eventIds: [c.eventId] });
    expect([...(await batchAttestations(t.db, theirs.batchId)).values()].map((x) => x.issuer)).toEqual(['Other org certifier']);
    expect(await batchAttestations(t.db, mine.batchId)).toEqual(new Map());
  });

  it('an unknown batch has none', async () => {
    expect(await batchAttestations(t.db, 'B-UNKNOWN0')).toEqual(new Map());
  });
});

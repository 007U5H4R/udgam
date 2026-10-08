import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE } from '../../../../scripts/tracer-world';
import { seedFpo, type FpoWorld } from '../../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { persistAccepted, persistRejected, type StoredMedia } from '../../capture/persist';
import { jcs, sha256Hex, sign } from '../../crypto';
import type { CapturePayloadV1, CheckResult, Verdict } from '../../verification/types';
import { writeTx } from '../client';
import { getPickingDetail } from './picking-detail';

// TSK-11.5 / TC-051 (detail): a picking's photos, kg, receipt time, plot, verdict, up to three farmer
// lines and each check's state — for this agent's own pickings only; anyone else's is not found.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-picking-detail-'));
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

const photo = (n: number): StoredMedia => {
  const sha = String(n).repeat(64).slice(0, 64);
  return { sha256: sha, size: 1000 + n, mime: 'image/jpeg', path: `media/${sha.slice(0, 2)}/${sha}.jpg`, exif: { gps: null, takenAt: null, hadOffset: false } };
};

async function picking(world: FpoWorld, o: { at: string; kg: number; verdict: Verdict; checks: CheckResult[]; photos: StoredMedia[] }) {
  const d = world.device;
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plots.arabica.plotId,
    deviceId: d.id,
    seq: d.seq + 1,
    prevEventHash: d.last,
    capturedAt: o.at,
    gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
    cherryKg: o.kg,
    media: o.photos.map(({ sha256, size, mime }) => ({ sha256, size, mime })),
  };
  const payloadString = jcs(payload);
  const payloadHash = await sha256Hex(payloadString);
  const signature = await sign(d.pair.privateKey, payloadString);
  const { eventId } = await writeTx(t.db, (tx) =>
    persistAccepted(tx, {
      payload,
      payloadString,
      payloadHash,
      signature,
      serverReceivedAt: o.at,
      device: { id: d.id, agentId: world.agentId, publicJwk: d.publicJwk, revokedAt: null, lastSeq: d.seq, lastEventHash: d.last === 'genesis' ? null : d.last },
      media: o.photos,
      result: { verdict: o.verdict, score: 0, checks: o.checks, unavailableProviders: [], capReasons: [], config: { version: 'cfg-1', hash: '0'.repeat(64) } },
    }),
  );
  d.seq += 1;
  d.last = payloadHash;
  return eventId;
}

const ok = (id: CheckResult['id'], evidence: string): CheckResult => ({ id, status: 'ok', score: 1, weight: 1, hardFail: false, evidence });

describe('getPickingDetail', () => {
  it('gives the photos in payload order, kg, receipt time, plot, verdict, the farmer lines and each check state', async () => {
    const cloudy: CheckResult = { id: 'ndvi_harvest_window', status: 'unavailable', score: 0, weight: 1, hardFail: false, evidence: 'Satellite view blocked by cloud for ±15 days', provider: 'sentinel-hub' };
    const id = await picking(w, {
      at: '2026-09-24T05:00:00.000Z',
      kg: 44,
      verdict: 'Needs Review',
      checks: [ok('signature_valid', 'Signed by the enrolled phone'), ok('geofence', 'Inside the plot, 14 m from the edge'), cloudy],
      photos: [photo(1), photo(2), photo(3)],
    });
    const d = await getPickingDetail(t.db, w.agentId, w.orgId, id);
    expect(d).toMatchObject({ eventId: id, receivedAt: '2026-09-24T05:00:00.000Z', cherryKg: 44, plotName: 'Plot 1', verdict: 'Needs Review' });
    expect(d!.photos).toHaveLength(3);
    const stored = await t.client.execute({ sql: 'SELECT id, sha256 FROM media WHERE event_id = ?', args: [id] });
    const bySha = new Map(stored.rows.map((r) => [String(r.sha256), String(r.id)]));
    expect(d!.photos).toEqual([photo(1), photo(2), photo(3)].map((p) => bySha.get(p.sha256)));
    expect(d!.lines).toEqual([
      { icon: 'cloud', text: 'The satellite picture for this month was cloudy.' },
      { icon: 'check', text: "The office will look at this. You'll see the answer in Pickings. You don't need to do anything.", next: true },
    ]);
    expect(d!.checks).toEqual([
      { id: 'signature_valid', status: 'ok' },
      { id: 'geofence', status: 'ok' },
      { id: 'ndvi_harvest_window', status: 'unavailable' },
    ]);
  });

  it("another agent's picking, even in this organisation, is not found; an accepted picking outside this organisation is not found", async () => {
    const colleague = await seedFpo(t.db, { orgId: w.orgId, adminId: w.adminId });
    const theirs = await picking(colleague, { at: '2026-09-24T05:00:00.000Z', kg: 44, verdict: 'Verified', checks: [], photos: [] });
    expect(await getPickingDetail(t.db, w.agentId, w.orgId, theirs)).toBeNull();
    expect(await getPickingDetail(t.db, colleague.agentId, w.orgId, theirs)).not.toBeNull();
    const other = await seedFpo(t.db);
    expect(await getPickingDetail(t.db, colleague.agentId, other.orgId, theirs)).toBeNull();
    expect(await getPickingDetail(t.db, w.agentId, w.orgId, 'HE-NOPE')).toBeNull();
  });

  it('a boundary refusal: Not accepted with what happened and what to do, and no checks', async () => {
    const payload: CapturePayloadV1 = {
      v: 1,
      plotId: w.plots.arabica.plotId,
      deviceId: w.device.id,
      seq: 1,
      prevEventHash: 'genesis',
      capturedAt: '2026-09-20T05:00:00.000Z',
      gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
      cherryKg: 30,
      media: [{ sha256: 'b'.repeat(64), size: 1000, mime: 'image/jpeg' }],
    };
    const { eventId } = await writeTx(t.db, (tx) =>
      persistRejected(tx, {
        payloadString: jcs(payload),
        payloadHash: 'c'.repeat(64),
        signature: 'sig',
        serverReceivedAt: '2026-09-20T05:00:00.000Z',
        reason: 'device_revoked',
        payload,
        device: { id: w.device.id, agentId: w.agentId, publicJwk: w.device.publicJwk, revokedAt: null, lastSeq: 0, lastEventHash: null },
      }),
    );
    expect(await getPickingDetail(t.db, w.agentId, w.orgId, eventId)).toEqual({
      eventId,
      receivedAt: '2026-09-20T05:00:00.000Z',
      cherryKg: 30,
      plotName: 'Plot 1',
      verdict: 'Rejected',
      photos: [],
      lines: [
        { icon: 'seal', text: 'The office has switched this phone off for pickings.' },
        { icon: 'check', text: 'Ask the office for a new code to set up this phone again.', next: true },
      ],
      checks: [],
    });
  });
});

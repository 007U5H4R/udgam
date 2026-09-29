import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_AREA_HA, P01_POLYGON, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, makePayload, photoHash, type TestDevice } from '../../../tests/helpers/verify';
import { writeTx } from '../db/client';
import { devices, harvestEvents, media, plots, verificationRuns } from '../db/schema';
import { seedYieldReference } from '../db/seed/yield-reference';
import { append } from '../ledger/hashchain';
import { buildContext } from './context';
import type { BoundaryDevice } from './boundary';

let t: TempDb;
let world: TracerWorld;
let dev: TestDevice;
let boundaryDevice: BoundaryDevice;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  const [row] = await t.db.select().from(devices).where(eq(devices.id, world.deviceId));
  boundaryDevice = {
    id: row!.id,
    agentId: row!.agentId,
    publicJwk: JSON.parse(row!.publicKeyJwk) as JsonWebKey,
    revokedAt: row!.revokedAt,
    lastSeq: row!.lastSeq,
    lastEventHash: row!.lastEventHash,
  };
});
afterEach(async () => {
  await t.cleanup();
});

async function plotRow() {
  const [p] = await t.db.select().from(plots).where(eq(plots.id, world.plotId));
  return p!;
}

async function insertEvent(
  id: string,
  status: 'accepted' | 'rejected',
  hashes: string[],
  over: { seq?: number; lat?: number; kg?: number; receivedAt?: string; verdict?: 'Verified' | 'Rejected'; deviceId?: string } = {},
) {
  await writeTx(t.db, async (tx) => {
    const a = await append(tx, 'harvest_event', { eventId: id });
    await tx.insert(harvestEvents).values({
      id,
      plotId: world.plotId,
      deviceId: over.deviceId ?? world.deviceId,
      agentId: world.agentId,
      seq: over.seq ?? 1,
      clientCapturedAt: '2026-10-14T04:12:33.120Z',
      serverReceivedAt: over.receivedAt ?? '2026-10-14T04:12:34.000Z',
      lat: over.lat ?? 12.4211,
      lng: 75.7392,
      accuracyM: 8,
      cherryKg: over.kg ?? 42.5,
      prevEventHash: 'genesis',
      payload: `{"id":"${id}"}`,
      payloadHash: photoHash(id.length + hashes.length + (over.seq ?? 1) * 7),
      signature: 'sig',
      boundaryStatus: status,
      anchorSeq: a.seq,
    });
    for (const [i, h] of hashes.entries()) {
      await tx.insert(media).values({ id: `${id}-m${i}`, eventId: id, path: `media/${h}.jpg`, sha256: h, size: 1, mime: 'image/jpeg' });
    }
    if (over.verdict) {
      const r = await append(tx, 'verification_run', { eventId: id });
      await tx.insert(verificationRuns).values({
        id: `${id}-r`,
        eventId: id,
        runNo: 1,
        verdict: over.verdict,
        score: 90,
        checks: '[]',
        unavailableProviders: '[]',
        configVersion: 'cfg-1',
        configHash: 'h',
        createdAt: over.receivedAt ?? '2026-10-14T04:12:34.000Z',
        anchorSeq: r.seq,
      });
    }
  });
}

describe('buildContext', () => {
  it('for a first-ever event: previousEvent null, device.lastSeq 0, nothing seen, P01 geometry', async () => {
    const payload = await makePayload({ device: { ...dev, id: world.deviceId }, plotId: world.plotId });
    const ctx = await buildContext(t.db, { payload, device: boundaryDevice, plot: await plotRow() });
    expect(ctx.previousEvent).toBeNull();
    expect(ctx.device).toEqual({
      id: world.deviceId,
      publicJwk: boundaryDevice.publicJwk,
      revokedAt: null,
      lastSeq: 0,
      lastEventHash: null,
    });
    expect(ctx.agentPriorAcceptedEvents).toBe(0);
    expect([...ctx.seenMediaHashes]).toEqual([]);
    expect(ctx.plot).toEqual({ id: world.plotId, crop: 'arabica', polygon: P01_POLYGON, areaHa: P01_AREA_HA });
    expect(ctx.remoteSensing.name).toBe('fixture');
  });

  it('sees only this submission’s hashes that belong to accepted events', async () => {
    await insertEvent('HE-ACC', 'accepted', [photoHash(1), photoHash(9)], { seq: 1, lat: 12.42111 });
    await insertEvent('HE-REJ', 'rejected', [photoHash(2)], { seq: 2 });
    const payload = await makePayload({
      device: { ...dev, id: world.deviceId },
      plotId: world.plotId,
      mediaHashes: [photoHash(1), photoHash(2), photoHash(3)],
    });
    const ctx = await buildContext(t.db, { payload, device: boundaryDevice, plot: await plotRow() });
    expect([...ctx.seenMediaHashes]).toEqual([photoHash(1)]);
    expect(ctx.agentPriorAcceptedEvents).toBe(1);
    expect(ctx.previousEvent).toEqual({ lat: 12.42111, lng: 75.7392, capturedAt: '2026-10-14T04:12:33.120Z' });
  });

  it('TP6: the season total before this capture (by server receipt time in IST) and the seeded yield reference', async () => {
    await seedYieldReference(t.db);
    await insertEvent('HE-S1', 'accepted', [], { kg: 100, verdict: 'Verified', receivedAt: '2026-10-02T04:00:00.000Z' });
    await insertEvent('HE-S2', 'accepted', [], { seq: 2, kg: 900, verdict: 'Rejected', receivedAt: '2026-10-03T04:00:00.000Z' });
    await insertEvent('HE-S3', 'accepted', [], { seq: 3, kg: 55.5, verdict: 'Verified', receivedAt: '2026-09-30T18:29:59.999Z' }); // last season
    const payload = await makePayload({ device: { ...dev, id: world.deviceId }, plotId: world.plotId });
    const ctx = await buildContext(t.db, { payload, device: boundaryDevice, plot: await plotRow(), serverReceivedAt: '2026-10-14T04:12:34.000Z' });
    expect(ctx.seasonCherryKgBefore).toBe(100);
    expect(ctx.yieldReference).toEqual({ maxKgHa: 783, cherryToCleanRatio: 1 / 6, source: expect.stringContaining('Coffee Board') });
  });

  it('no seeded reference row → yieldReference null (yield_plausibility reports unavailable)', async () => {
    const payload = await makePayload({ device: { ...dev, id: world.deviceId }, plotId: world.plotId });
    const ctx = await buildContext(t.db, { payload, device: boundaryDevice, plot: await plotRow(), serverReceivedAt: '2026-10-14T04:12:34.000Z' });
    expect(ctx.yieldReference).toBeNull();
    expect(ctx.seasonCherryKgBefore).toBe(0);
  });

  it('TP10: agentPriorAcceptedEvents counts the agent’s accepted events on every device, never boundary refusals', async () => {
    await writeTx(t.db, async (tx) => {
      const a = await append(tx, 'device_enrolled', { deviceId: 'DV-OLD00000' });
      await tx.insert(devices).values({ id: 'DV-OLD00000', agentId: world.agentId, publicKeyJwk: '{}', keyThumbprint: 'kid-old', enrolledAt: '2026-10-01T00:00:00.000Z', revokedAt: '2026-10-10T00:00:00.000Z', anchorSeq: a.seq });
    });
    await insertEvent('HE-O1', 'accepted', [], { seq: 1, deviceId: 'DV-OLD00000' });
    await insertEvent('HE-O2', 'accepted', [], { seq: 2, deviceId: 'DV-OLD00000' });
    await insertEvent('HE-O3', 'rejected', [], { seq: 3, deviceId: 'DV-OLD00000' });
    const payload = await makePayload({ device: { ...dev, id: world.deviceId }, plotId: world.plotId });
    const ctx = await buildContext(t.db, { payload, device: boundaryDevice, plot: await plotRow(), serverReceivedAt: '2026-10-14T04:12:34.000Z' });
    expect(ctx.agentPriorAcceptedEvents).toBe(2);
    expect(ctx.device.lastSeq).toBe(0); // this phone's own chain head is untouched
  });
});

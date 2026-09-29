import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_AREA_HA, P01_POLYGON, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, makePayload, photoHash, type TestDevice } from '../../../tests/helpers/verify';
import { writeTx } from '../db/client';
import { devices, harvestEvents, media, plots } from '../db/schema';
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

async function insertEvent(id: string, status: 'accepted' | 'rejected', hashes: string[], over: { seq?: number; lat?: number } = {}) {
  await writeTx(t.db, async (tx) => {
    const a = await append(tx, 'harvest_event', { eventId: id });
    await tx.insert(harvestEvents).values({
      id,
      plotId: world.plotId,
      deviceId: world.deviceId,
      agentId: world.agentId,
      seq: over.seq ?? 1,
      clientCapturedAt: '2026-10-14T04:12:33.120Z',
      serverReceivedAt: '2026-10-14T04:12:34.000Z',
      lat: over.lat ?? 12.4211,
      lng: 75.7392,
      accuracyM: 8,
      cherryKg: 42.5,
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
});

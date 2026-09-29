import { generateKeyPair, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../../src/lib/crypto';
import { persistAccepted } from '../../src/lib/capture/persist';
import { writeTx, type Db } from '../../src/lib/db/client';
import { devices, farmers, organisations, plots, user } from '../../src/lib/db/schema';
import { newId } from '../../src/lib/ids';
import { append } from '../../src/lib/ledger/hashchain';
import type { CapturePayloadV1, Verdict, VerifyResult } from '../../src/lib/verification/types';
import { P01_AREA_HA, P01_INSIDE, P01_POLYGON } from '../../scripts/tracer-plot';

// An FPO with an arabica and a robusta plot, an agent with one enrolled phone and an admin, for the
// batch and custody tests (TKT-14) and the batches e2e seed. Everything is written by the real writers
// with its ledger anchor: plot_registered and device_enrolled entries, captures via persistAccepted
// (harvest_event + verification_run), so a batch built on top has a complete provenance closure.

export type Crop = 'arabica' | 'robusta';

export type FpoWorld = {
  orgId: string;
  adminId: string;
  agentId: string;
  plots: Record<Crop, { plotId: string; producerId: string }>;
  device: { id: string; pair: CryptoKeyPair; publicJwk: JsonWebKey; seq: number; last: string };
};

export type Capture = { eventId: string; runId: string; payloadHash: string; cherryKg: number; score: number; plotId: string };

const ts = () => new Date().toISOString();

/**
 * Seed an FPO world. With `orgId` (an existing FPO) and `adminId` (an existing admin of it) only the
 * farmer, plots, agent and phone are added; otherwise a new FPO and admin are created too. Every call
 * makes new random IDs for what it creates.
 */
export async function seedFpo(db: Db, o: { orgId?: string; adminId?: string } = {}): Promise<FpoWorld> {
  const orgId = o.orgId ?? newId('ORG-');
  const adminId = o.adminId ?? newId('USR-');
  const agentId = newId('USR-');
  const pair = await generateKeyPair(false);
  const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
  const deviceId = newId('DV-');
  const world: FpoWorld = {
    orgId,
    adminId,
    agentId,
    plots: { arabica: { plotId: newId('PL-'), producerId: newId('PR-') }, robusta: { plotId: newId('PL-'), producerId: newId('PR-') } },
    device: { id: deviceId, pair, publicJwk, seq: 0, last: 'genesis' },
  };
  await writeTx(db, async (tx) => {
    if (!o.orgId) await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: `FPO ${orgId}` });
    if (!o.adminId) await tx.insert(user).values({ id: adminId, name: 'Test admin', email: `${adminId.toLowerCase()}@fpo.udgam.test`, role: 'admin', orgId });
    await tx.insert(user).values({ id: agentId, name: 'Test agent', email: `${agentId.toLowerCase()}@fpo.udgam.test`, role: 'agent', orgId });
    for (const crop of ['arabica', 'robusta'] as const) {
      const { plotId, producerId } = world.plots[crop];
      const farmerId = newId('FA-');
      await tx.insert(farmers).values({ id: farmerId, orgId, name: 'Test farmer', producerId });
      const a = await append(tx, 'plot_registered', { plotId, producerId, crop, areaHa: P01_AREA_HA, polygon: P01_POLYGON });
      await tx.insert(plots).values({ id: plotId, farmerId, crop, geojson: JSON.stringify(P01_POLYGON), areaHa: P01_AREA_HA, anchorSeq: a.seq, createdAt: ts(), updatedAt: ts() });
    }
    const kid = await jwkThumbprint(publicJwk);
    const a = await append(tx, 'device_enrolled', { deviceId, agentId, kid, publicJwk, enrolledAt: ts() });
    await tx.insert(devices).values({ id: deviceId, agentId, publicKeyJwk: JSON.stringify(publicJwk), keyThumbprint: kid, enrolledAt: ts(), anchorSeq: a.seq });
  });
  return world;
}

/** A buyer organisation (and optionally a buyer user). */
export async function seedBuyer(db: Db, type: 'buyer' | 'fpo' | 'processor' = 'buyer'): Promise<string> {
  const id = newId('ORG-');
  await writeTx(db, (tx) => tx.insert(organisations).values({ id, type, name: `${type} ${id}` }));
  return id;
}

const result = (verdict: Verdict, score: number): VerifyResult => ({
  verdict,
  score,
  checks: [{ id: 'signature_valid', status: 'ok', score: 1, weight: 1, hardFail: false, evidence: 'Signed by the enrolled phone.' }],
  unavailableProviders: [],
  capReasons: [],
  config: { version: 'cfg-1', hash: '0'.repeat(64) },
});

/** One signed, accepted capture on the world's `crop` plot, with one verification run. */
export async function seedCapture(db: Db, w: FpoWorld, c: { crop?: Crop; kg: number; verdict?: Verdict; score?: number }): Promise<Capture> {
  const crop = c.crop ?? 'arabica';
  const verdict = c.verdict ?? 'Verified';
  const score = c.score ?? 90;
  const d = w.device;
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: w.plots[crop].plotId,
    deviceId: d.id,
    seq: d.seq + 1,
    prevEventHash: d.last,
    capturedAt: ts(),
    gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
    cherryKg: c.kg,
    media: [{ sha256: newId('', 64).toLowerCase().replace(/[^0-9a-f]/g, 'a'), size: 1000, mime: 'image/jpeg' }],
  };
  const payloadString = jcs(payload);
  const payloadHash = await sha256Hex(payloadString);
  const signature = await sign(d.pair.privateKey, payloadString);
  const ids = await writeTx(db, (tx) =>
    persistAccepted(tx, {
      payload,
      payloadString,
      payloadHash,
      signature,
      serverReceivedAt: ts(),
      device: { id: d.id, agentId: w.agentId, publicJwk: d.publicJwk, revokedAt: null, lastSeq: d.seq, lastEventHash: d.last === 'genesis' ? null : d.last },
      media: [],
      result: result(verdict, score),
    }),
  );
  d.seq += 1;
  d.last = payloadHash;
  return { ...ids, payloadHash, cherryKg: c.kg, score, plotId: payload.plotId };
}

import { eq } from 'drizzle-orm';
import { attachAttestation } from '../../attestations/attach';
import { createBatch } from '../../batches/create';
import { persistAccepted } from '../../capture/persist';
import { generateKeyPair, jcs, publicMembers, sha256Hex, sign } from '../../crypto';
import { transferBatch } from '../../custody/transfer';
import { writeTx, type Db } from '../../db/client';
import { farmers, organisations, plots, user } from '../../db/schema';
import { issueCode } from '../../enrolment/codes';
import { enrolDevice } from '../../enrolment/enrol';
import type { Polygon } from '../../geo/types';
import { newId } from '../../ids';
import { registerPlot } from '../../plots/plots';
import type { CapturePayloadV1, CheckResult, VerifyResult } from '../../verification/types';

// A provenance world for the certificate (TKT-16): the fixture feed (make-feed.ts), the certificate e2e
// seed and the S4 perf fixture all build their batch here, through the real writers — registerPlot
// (plot_registered, then the registration checks' plot_edited), issueCode + enrolDevice
// (device_enrolled {deviceId, agentId, thumbprint}), persistAccepted (harvest_event + verification_run),
// attachAttestation, createBatch and transferBatch (signed by the admin's server-held key). Nothing is
// appended by hand. Farmers' names and identifiers are only ever written to the farmers table, so a
// test can plant sentinels there and prove they never reach the public feed (EV16, EVAL-084).
//
// Server-only (it writes the database and DATA_DIR/keys); callers set DATA_DIR before the first env read.

/** P01 (scripts/tracer-plot.ts): a 2.0 ha hexagon near Madikeri, Kodagu. Plots are copies moved east. */
const P01_RING: number[][] = [
  [75.739986, 12.4213057],
  [75.7393573, 12.4218229],
  [75.7385331, 12.4216088],
  [75.7384847, 12.4207742],
  [75.7390777, 12.4202501],
  [75.7397745, 12.4205949],
  [75.739986, 12.4213057],
];
const P01_CENTRE = { lat: 12.4211, lng: 75.7392 };
/** Neighbouring plots: each 0.0024° (about 260 m) east and 0.0009° north of the last, so they never overlap. */
const STEP = { lng: 0.0024, lat: 0.0009 };

export function fixturePlot(i: number): { polygon: Polygon; inside: { lat: number; lng: number } } {
  const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
  return {
    polygon: { type: 'Polygon', coordinates: [P01_RING.map(([lng, lat]) => [r7(lng! + i * STEP.lng), r7(lat! + i * STEP.lat)])] },
    inside: { lat: r7(P01_CENTRE.lat + i * STEP.lat), lng: r7(P01_CENTRE.lng + i * STEP.lng) },
  };
}

/** The twelve checks of an accepted, Verified capture, as the verifier words them (§6.5; fixture satellite data is labelled demo data, EXE12). */
export function verifiedChecks(deviceId: string): CheckResult[] {
  const ok = (id: CheckResult['id'], evidence: string, extra: Partial<CheckResult> = {}): CheckResult => ({ id, status: 'ok', score: 1, weight: 1, hardFail: false, evidence, ...extra });
  return [
    ok('signature_valid', `Signed by enrolled phone ${deviceId}`),
    ok('chain_continuity', 'Entry follows the previous entry from this phone'),
    ok('photo_uniqueness', '3 of 3 photos are new'),
    ok('geofence', 'Inside the plot, 42 m from the edge'),
    ok('gps_accuracy', 'GPS accuracy 8 m (good under 30 m, limit 100 m)'),
    ok('exif_gps_agreement', 'Photo location 10 m from phone location (limit 50 m)'),
    ok('exif_time_agreement', 'Photo time 2 min from capture time (limit 10 min); phone clock 0 min from server (limit 24 h)'),
    ok('movement_plausibility', 'First entry from this phone'),
    ok('deforestation_overlap', '0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)', { provider: 'gfw' }),
    ok('ndvi_cultivation', 'Canopy all year: monthly NDVI 0.62–0.81 over 11 clear months (needs ≥ 0.50, swing ≤ 0.35) (demo data)', { provider: 'sentinel-hub' }),
    ok('ndvi_harvest_window', 'Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45) (demo data)', { provider: 'sentinel-hub' }),
    ok('yield_plausibility', 'Season total 0.30x the reference upper bound (flag above 1.50x, hard fail above 2.00x)'),
  ];
}

/** A minimal one-page PDF (magic bytes and trailer), for the organic attestation. */
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

export type CertificateWorldOptions = {
  events: number;
  plots: number;
  /** The farmer registered for plot `i` (default: an ordinary name, no identifier). */
  farmer?: (i: number) => { name: string; identifier: string | null };
  /** The FPO's office phone (organisations.office_phone). */
  officePhone?: string;
  /** Capture time of event `i` (default: 2 Sep 2026 onwards, one every two days, 10:00 IST). */
  capturedAt?: (i: number) => string;
  /** Cherry kg of event `i` (multiples of 0.5 kg). */
  kg?: (i: number) => number;
  /** An organic attestation on the first plot. */
  attestation?: boolean;
  /** Transfer the batch to a new buyer organisation. */
  transfer?: boolean;
  /** An existing buyer organisation to transfer to (instead of a new one). */
  buyerOrgId?: string;
};

export type CertificateWorld = {
  batchId: string;
  shortHash: string;
  orgId: string;
  buyerOrgId: string | null;
  plotIds: string[];
  producerIds: string[];
  eventIds: string[];
  deviceId: string;
  totalKg: number;
};

const DAY = 86_400_000;
const defaultCapturedAt = (i: number) => new Date(Date.parse('2026-09-02T04:30:00.000Z') + i * 2 * DAY).toISOString();
const defaultKg = (i: number) => 38 + (i % 5) * 3.5;

/** Seed an FPO, its farmers, plots, one phone, `events` Verified pickings and one batch of all of them. */
export async function seedCertificateWorld(db: Db, o: CertificateWorldOptions): Promise<CertificateWorld> {
  const orgId = newId('ORG-');
  const adminId = newId('USR-');
  const agentId = newId('USR-');
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: `Fixture FPO ${orgId}`, officePhone: o.officePhone ?? null });
    await tx.insert(user).values({ id: adminId, name: 'Fixture admin', email: `${adminId.toLowerCase()}@cert.udgam.test`, emailVerified: true, role: 'admin', orgId });
    await tx.insert(user).values({ id: agentId, name: 'Fixture agent', email: `${agentId.toLowerCase()}@cert.udgam.test`, emailVerified: true, role: 'agent', orgId });
  });

  const plotIds: string[] = [];
  const insides: { lat: number; lng: number }[] = [];
  for (let i = 0; i < o.plots; i++) {
    const { polygon, inside } = fixturePlot(i);
    const farmer = o.farmer?.(i) ?? { name: `Fixture farmer ${i + 1}`, identifier: null };
    const { plotId } = await registerPlot(db, orgId, { crop: 'arabica', geometry: polygon, newFarmer: farmer });
    plotIds.push(plotId);
    insides.push(inside);
  }

  const pair = await generateKeyPair(false);
  const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
  const { code } = await issueCode(db, { agentId, adminId, orgId });
  const enrolled = await enrolDevice(db, { code, publicJwk, ip: '203.0.113.7', sessionAgentId: agentId });
  if (!enrolled.ok) throw new Error(`fixture: enrolment refused (${enrolled.reason})`);
  const deviceId = enrolled.deviceId;

  const capturedAt = o.capturedAt ?? defaultCapturedAt;
  const kgOf = o.kg ?? defaultKg;
  const eventIds: string[] = [];
  let last = 'genesis';
  let totalKg = 0;
  for (let i = 0; i < o.events; i++) {
    const p = i % o.plots;
    const payload: CapturePayloadV1 = {
      v: 1,
      plotId: plotIds[p]!,
      deviceId,
      seq: i + 1,
      prevEventHash: last,
      capturedAt: capturedAt(i),
      gps: { ...insides[p]!, accuracyM: 8 },
      cherryKg: kgOf(i),
      media: [0, 1, 2].map((k) => ({ sha256: newId('', 64).toLowerCase().replace(/[^0-9a-f]/g, String(k)), size: 180_000 + k, mime: 'image/jpeg' })),
    };
    const payloadString = jcs(payload);
    const payloadHash = await sha256Hex(payloadString);
    const signature = await sign(pair.privateKey, payloadString);
    const result: VerifyResult = { verdict: 'Verified', score: 92, checks: verifiedChecks(deviceId), unavailableProviders: [], capReasons: [], config: { version: 'cfg-1', hash: '0'.repeat(64) } };
    const ids = await writeTx(db, (tx) =>
      persistAccepted(tx, {
        payload,
        payloadString,
        payloadHash,
        signature,
        serverReceivedAt: new Date(Date.parse(payload.capturedAt) + 40_000).toISOString(),
        device: { id: deviceId, agentId, publicJwk, revokedAt: null, lastSeq: i, lastEventHash: last === 'genesis' ? null : last },
        media: [],
        result,
      }),
    );
    last = payloadHash;
    totalKg += payload.cherryKg;
    eventIds.push(ids.eventId);
  }

  if (o.attestation) {
    await attachAttestation(db, { orgId, plotId: plotIds[0]!, file: PDF, issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-12-31' });
  }

  const batch = await createBatch(db, { orgId, adminId, crop: 'arabica', eventIds });
  let buyerOrgId: string | null = null;
  if (o.transfer) {
    buyerOrgId = o.buyerOrgId ?? newId('ORG-');
    if (!o.buyerOrgId) {
      const id = buyerOrgId;
      await writeTx(db, (tx) => tx.insert(organisations).values({ id, type: 'buyer', name: `Fixture roaster ${id}` }));
    }
    await transferBatch(db, { orgId, adminId, batchId: batch.batchId, toOrgId: buyerOrgId });
  }

  const producerIds: string[] = [];
  for (const plotId of plotIds) {
    const [row] = await db.select({ producerId: farmers.producerId }).from(plots).innerJoin(farmers, eq(farmers.id, plots.farmerId)).where(eq(plots.id, plotId));
    producerIds.push(row!.producerId);
  }
  return { batchId: batch.batchId, shortHash: batch.shortHash, orgId, buyerOrgId, plotIds, producerIds, eventIds, deviceId, totalKg };
}

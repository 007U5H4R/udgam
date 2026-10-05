import type { Anchor } from '../../src/lib/ledger/types';
import { generateKeyPair, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../../src/lib/crypto';
import { persistAccepted, persistRejected } from '../../src/lib/capture/persist';
import { writeTx, type Db, type Tx } from '../../src/lib/db/client';
import { farmers, organisations, plots, user } from '../../src/lib/db/schema';
import { anchorEnrolledDevice } from '../../src/lib/enrolment/enrol';
import { newId } from '../../src/lib/ids';
import { append } from '../../src/lib/ledger/hashchain';
import type { CapturePayloadV1, VerifyResult } from '../../src/lib/verification/types';
import { P01_AREA_HA, P01_POLYGON } from '../../scripts/tracer-plot';

// A provenance world with one batch, for the proof-feed tests and the harness proof suite (TKT-15).
// Plots, devices, captures and verification runs are written by the real writers (tables + anchors
// in one transaction; persistAccepted for captures). Kinds whose services arrive later (plot edits
// TKT-06, revocation TKT-05, attestations TKT-13, overrides TKT-12, batches and custody TKT-14) are
// appended to the ledger with the payloads their plans specify; the signed ones carry
// { …statement, kid, publicJwk, signature } over jcs(statement).

export type AdminKey = { adminId: string; pair: CryptoKeyPair; publicJwk: JsonWebKey; kid: string };

export async function makeAdminKey(adminId = newId('AD-')): Promise<AdminKey> {
  const pair = await generateKeyPair(false);
  const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
  return { adminId, pair, publicJwk, kid: await jwkThumbprint(publicJwk) };
}

/** A signed statement as TKT-12/14 anchor it: the statement plus kid, publicJwk and signature over jcs(statement). */
export async function signStatement(admin: AdminKey, statement: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { ...statement, kid: admin.kid, publicJwk: admin.publicJwk, signature: await sign(admin.pair.privateKey, jcs(statement)) };
}

export type BatchWorldOptions = {
  events: number;
  plots: number;
  devices?: number;
  /** Edit the first plot's polygon (plot_edited). */
  editPlot?: boolean;
  /** Anchor an organic attestation on the first plot. */
  attestation?: boolean;
  /** Revoke the last device after the captures. */
  revokeDevice?: boolean;
  /** The first event's run is Needs Review and an admin override makes it Verified. */
  override?: boolean;
  /** Transfer the batch to a buyer. */
  transfer?: boolean;
  /** An existing organisation to reuse (so two batches can share an FPO). */
  orgId?: string;
  /**
   * batch_created lists a wrong payloadHash for its first member (an insider's misstated batch, for
   * the closure-incomplete vector): every hash, path and signature is otherwise genuine.
   */
  misstateEventHash?: boolean;
};

export type BatchWorld = {
  batchId: string;
  shortHash: string;
  orgId: string;
  buyerOrgId: string | null;
  admin: AdminKey;
  plotIds: string[];
  deviceIds: string[];
  eventIds: string[];
  runIds: string[];
  /** Anchors of the entries written without a table (their services arrive later). */
  anchors: { batchCreated: Anchor; custody: Anchor[]; overrides: Anchor[]; attestations: Anchor[]; plotEdits: Anchor[]; revocations: Anchor[] };
};

const result = (verdict: VerifyResult['verdict'], score: number): VerifyResult => ({
  verdict,
  score,
  checks: [{ id: 'signature_valid', status: 'ok', score: 1, weight: 1, hardFail: false, evidence: 'Signed by the enrolled phone.' }],
  unavailableProviders: [],
  capReasons: [],
  config: { version: 'cfg-1', hash: '0'.repeat(64) },
});

/** Seed a world and one batch over all of its events. Every call makes new random IDs. */
export async function seedBatchWorld(db: Db, o: BatchWorldOptions): Promise<BatchWorld> {
  const admin = await makeAdminKey();
  const orgId = o.orgId ?? newId('ORG-');
  const plotIds = Array.from({ length: o.plots }, () => newId('PL-'));
  const devs = await Promise.all(
    Array.from({ length: o.devices ?? 1 }, async () => {
      const pair = await generateKeyPair(false);
      const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
      return { id: newId('DV-'), agentId: newId('AG-'), pair, publicJwk, seq: 0, last: 'genesis' };
    }),
  );
  const anchors: BatchWorld['anchors'] = { batchCreated: undefined as unknown as Anchor, custody: [], overrides: [], attestations: [], plotEdits: [], revocations: [] };
  const ts = () => new Date().toISOString();

  await writeTx(db, async (tx) => {
    if (!o.orgId) await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: 'Test FPO' });
    for (const plotId of plotIds) {
      const farmerId = newId('FA-');
      const producerId = newId('PR-');
      await tx.insert(farmers).values({ id: farmerId, orgId, name: 'Test farmer', producerId });
      const a = await append(tx, 'plot_registered', { plotId, producerId, crop: 'arabica', areaHa: P01_AREA_HA, polygon: P01_POLYGON });
      await tx.insert(plots).values({ id: plotId, farmerId, crop: 'arabica', geojson: JSON.stringify(P01_POLYGON), areaHa: P01_AREA_HA, anchorSeq: a.seq, createdAt: ts(), updatedAt: ts() });
    }
    for (const d of devs) {
      // Each phone's agent is a real user of the FPO (devices.agent_id → user, migration 0009).
      await tx.insert(user).values({ id: d.agentId, name: 'Test agent', email: `${d.agentId.toLowerCase()}@batch-world.test`, emailVerified: true, role: 'agent', orgId });
      // Anchored exactly as enrolment anchors a phone: device_enrolled {deviceId, agentId, thumbprint}.
      await anchorEnrolledDevice(tx, { deviceId: d.id, agentId: d.agentId, publicJwk: d.publicJwk, enrolledAt: ts() });
    }
    if (o.editPlot) anchors.plotEdits.push(await append(tx, 'plot_edited', { plotId: plotIds[0]!, areaHa: P01_AREA_HA, polygon: P01_POLYGON }));
    if (o.attestation) {
      anchors.attestations.push(
        await append(tx, 'attestation', { v: 1, attestationId: newId('AT-'), plotId: plotIds[0]!, type: 'organic', fileHash: 'f'.repeat(64), issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-01-01' }),
      );
    }
  });

  const eventIds: string[] = [];
  const runIds: string[] = [];
  const members: { eventId: string; payloadHash: string; cherryKg: number; score: number }[] = [];
  for (let i = 0; i < o.events; i++) {
    const d = devs[i % devs.length]!;
    const payload: CapturePayloadV1 = {
      v: 1,
      plotId: plotIds[i % plotIds.length]!,
      deviceId: d.id,
      seq: ++d.seq,
      prevEventHash: d.last,
      capturedAt: ts(),
      gps: { lat: 12.4211, lng: 75.7392, accuracyM: 8 },
      cherryKg: 20 + (i % 7) * 2.5,
      media: [{ sha256: (i + 1).toString(16).padStart(64, '0'), size: 1000, mime: 'image/jpeg' }],
    };
    const payloadString = jcs(payload);
    const payloadHash = await sha256Hex(payloadString);
    const signature = await sign(d.pair.privateKey, payloadString);
    const needsReview = o.override && i === 0;
    const score = needsReview ? 0.7 : 0.9;
    const ids = await writeTx(db, (tx) =>
      persistAccepted(tx, {
        payload,
        payloadString,
        payloadHash,
        signature,
        serverReceivedAt: ts(),
        device: { id: d.id, agentId: d.agentId, publicJwk: d.publicJwk, revokedAt: null, lastSeq: d.seq - 1, lastEventHash: null },
        media: [],
        result: result(needsReview ? 'Needs Review' : 'Verified', score),
      }),
    );
    d.last = payloadHash;
    eventIds.push(ids.eventId);
    runIds.push(ids.runId);
    members.push({ eventId: ids.eventId, payloadHash, cherryKg: payload.cherryKg, score });
  }

  let batchId = '';
  let shortHash = '';
  let buyerOrgId: string | null = null;
  await writeTx(db, async (tx: Tx) => {
    if (o.override) {
      const statement = { v: 1, runId: runIds[0]!, eventId: eventIds[0]!, newVerdict: 'Verified', reason: 'Scale photo checked by the office', adminId: admin.adminId, ts: ts() };
      anchors.overrides.push(await append(tx, 'admin_override', await signStatement(admin, statement)));
    }
    batchId = newId('B-');
    const sorted = [...members].sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
    const statement = {
      v: 1,
      batchId,
      orgId,
      crop: 'arabica',
      events: sorted.map(({ eventId, payloadHash }, i) => ({ eventId, payloadHash: o.misstateEventHash && i === 0 ? 'e'.repeat(64) : payloadHash })),
      quantityKg: members.reduce((n, m) => n + m.cherryKg, 0),
      integrityScore: Math.min(...members.map((m) => m.score)),
      adminId: admin.adminId,
      ts: ts(),
    };
    anchors.batchCreated = await append(tx, 'batch_created', await signStatement(admin, statement));
    shortHash = anchors.batchCreated.entryHash.slice(0, 12);
    if (o.transfer) {
      buyerOrgId = newId('ORG-');
      await tx.insert(organisations).values({ id: buyerOrgId, type: 'buyer', name: 'Test roaster' });
      anchors.custody.push(await append(tx, 'custody_transfer', await signStatement(admin, { v: 1, batchId, fromOrg: orgId, toOrg: buyerOrgId, ts: ts(), adminId: admin.adminId })));
    }
  });

  if (o.revokeDevice) {
    const d = devs[devs.length - 1]!;
    anchors.revocations.push(await writeTx(db, (tx) => append(tx, 'device_revoked', { deviceId: d.id, revokedAt: ts() })));
  }

  return { batchId, shortHash, orgId, buyerOrgId, admin, plotIds, deviceIds: devs.map((d) => d.id), eventIds, runIds, anchors };
}

/** Anchor a boundary-rejected capture naming `plotId` and `deviceId` (never part of a closure). */
export async function seedRejectedCapture(db: Db, plotId: string, deviceId: string): Promise<string | null> {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId,
    deviceId,
    seq: 999,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(),
    gps: { lat: 12.4211, lng: 75.7392, accuracyM: 8 },
    cherryKg: 10,
    media: [{ sha256: newId('', 64).toLowerCase().replace(/[^0-9a-f]/g, '0'), size: 1, mime: 'image/jpeg' }],
  };
  const payloadString = jcs(payload);
  const anchored = await writeTx(db, async (tx) =>
    persistRejected(tx, { payloadString, payloadHash: await sha256Hex(payloadString), signature: 'x', serverReceivedAt: new Date().toISOString(), reason: 'bad_signature', payload, device: null }),
  );
  return anchored.replayed ? null : anchored.eventId;
}

/** A later custody transfer (for the on-demand checkpoint test): appended after everything else. */
export async function transferAgain(db: Db, w: BatchWorld, toOrg: string): Promise<Anchor> {
  return writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: toOrg, type: 'buyer', name: 'Next roaster' });
    return append(tx, 'custody_transfer', await signStatement(w.admin, { v: 1, batchId: w.batchId, fromOrg: w.buyerOrgId ?? w.orgId, toOrg, ts: new Date().toISOString(), adminId: w.admin.adminId }));
  });
}

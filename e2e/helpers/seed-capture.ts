// Seeds a capture world for the capture-app e2e specs (TKT-10) into DATA_DIR's database. Every run
// makes its OWN FPO so parallel workers never share a phone, a plot or a chain head: one farmer with
// the requested fixture plots (evals/fixtures/plots/<id>.geojson geometry, so the fixture provider's
// profile for that geometry applies), all assigned to one agent (random per-run TEST password) with one
// phone (a TEST key the spec injects into IndexedDB). Optional earlier pickings on the first plot are
// signed by that phone and written by the real writer (persistAccepted), oldest first, so the phone's
// chain head moves on; with `--photo <file>` the newest one holds that file's bytes as its photo (the
// reused-photo case). Prints one JSON line: IDs, the chain head and the test-only secrets.
//
// TKT-11 adds: an event may name why it is not Verified (`44:Needs Review:cloud`, `29:Rejected:outside`),
// so its run carries the check the farmer copy layer explains; `--refusal <reason>` anchors one boundary
// refusal of this phone (after the events); `--phone <tel>` sets the organisation's office phone.
//
// EVAL-086 adds `--code`: an admin in the same organisation issues a one-time enrolment code for the
// agent, so a spec can enrol a fresh phone through /enrol (the seeded phone stays enrolled beside it).
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-capture.ts
//          [--plots P01,P09] [--events "38.5:Verified,44:Needs Review:cloud"] [--photo <file>]
//          [--refusal plot_not_assigned] [--phone +918000000000] [--code]
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import { generateKeyPair, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../../src/lib/crypto';
import { persistAccepted, persistRejected, type StoredMedia } from '../../src/lib/capture/persist';
import { closeDb, getDbReady, writeTx } from '../../src/lib/db/client';
import { issueCode } from '../../src/lib/enrolment/codes';
import { runMigrations } from '../../src/lib/db/migrate';
import { account, agentPlots, devices, farmers, organisations, plots, user } from '../../src/lib/db/schema';
import { locate } from '../../src/lib/geo/geofence';
import type { Polygon } from '../../src/lib/geo/types';
import { newId } from '../../src/lib/ids';
import { append } from '../../src/lib/ledger/hashchain';
import type { CapturePayloadV1, CheckResult, Verdict, VerifyResult } from '../../src/lib/verification/types';

export type SeededCapture = {
  orgId: string;
  agentEmail: string;
  /** TEST-ONLY random password for this run's agent. Never used outside .e2e-data. */
  testOnlyAgentPassword: string;
  farmerName: string;
  deviceId: string;
  /** TEST-ONLY private key for the spec to import (non-extractable) into IndexedDB. */
  testOnlyPrivateJwk: JsonWebKey;
  /** The phone's chain head after the seeded pickings. */
  nextSeq: number;
  lastEventHash: string;
  plots: { id: string; fixture: string; areaHa: number; inside: { lat: number; lng: number } }[];
  events: { eventId: string; cherryKg: number; verdict: Verdict }[];
  /** The boundary refusal seeded with --refusal, if any. */
  refusal?: { eventId: string; cherryKg: number; reason: string };
  /** TEST-ONLY one-time enrolment code for the agent (--code), valid 24 h. Never used outside .e2e-data. */
  testOnlyCode?: string;
};

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

type Fixture = { type: 'Feature'; properties: { id: string; area_ha: number }; geometry: Polygon };

/** A point well inside a convex-ish fixture: the vertex average, nudged towards the ring's first vertex until inside. */
function insidePoint(g: Polygon): { lat: number; lng: number } {
  const ring = g.coordinates[0]!.slice(0, -1);
  const c = { lng: ring.reduce((s, p) => s + p[0]!, 0) / ring.length, lat: ring.reduce((s, p) => s + p[1]!, 0) / ring.length };
  for (let t = 0; t < 1; t += 0.05) {
    const p = { lat: c.lat + (ring[0]![1]! - c.lat) * t, lng: c.lng + (ring[0]![0]! - c.lng) * t };
    const at = locate(p, g);
    if (at.inside && at.distanceToEdgeM > 20) return { lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) };
  }
  throw new Error('no inside point found');
}

/** The check that explains a seeded non-Verified picking (evidence as the verifier writes it, §6.5). */
const WHY: Record<string, CheckResult> = {
  cloud: { id: 'ndvi_harvest_window', status: 'unavailable', score: 0, weight: 1, hardFail: false, evidence: 'Satellite view blocked by cloud for ±15 days', provider: 'sentinel-hub' },
  outside: { id: 'geofence', status: 'fail', score: 0, weight: 1, hardFail: false, evidence: '212 m outside the plot edge (allowance 25 m)' },
};

const result = (verdict: Verdict, why?: string): VerifyResult => ({
  verdict,
  score: verdict === 'Verified' ? 95 : verdict === 'Needs Review' ? 70 : 30,
  checks: [{ id: 'signature_valid', status: 'ok', score: 1, weight: 1, hardFail: false, evidence: 'Signed by enrolled phone' }, ...(why && WHY[why] ? [WHY[why]] : [])],
  unavailableProviders: [],
  capReasons: verdict === 'Verified' ? [] : ['anyFail'],
  config: { version: 'cfg-1', hash: '0'.repeat(64) },
});

const db = await getDbReady();
try {
  await runMigrations(db);
  const plotFixtures = (arg('--plots') ?? 'P01').split(',').map((id) => JSON.parse(readFileSync(`evals/fixtures/plots/${id}.geojson`, 'utf8')) as Fixture);
  const events = (arg('--events') ?? '')
    .split(',')
    .filter(Boolean)
    .map((e) => {
      const [kg, verdict, why] = e.split(':');
      return { kg: Number(kg), verdict: (verdict ?? 'Verified') as Verdict, why };
    });
  const photo = arg('--photo');

  const orgId = newId('ORG-');
  const tag = orgId.slice(4).toLowerCase();
  const agentId = newId('USR-');
  const agentEmail = `agent-${tag}@capture.udgam.test`;
  const withCode = process.argv.includes('--code');
  const adminId = newId('USR-');
  const password = randomBytes(18).toString('base64url');
  const farmerId = newId('FA-');
  const producerId = newId('PR-');
  const farmerName = `Farmer ${tag.slice(0, 4).toUpperCase()}`;
  const pair = await generateKeyPair(true);
  const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
  const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  const kid = await jwkThumbprint(publicJwk);
  const deviceId = newId('DV-');
  const hash = await hashPassword(password);
  const now = new Date();
  // Registered a second apart, so the farmer's plot order (Plot 1, Plot 2, …) is the order given.
  const seeded = plotFixtures.map((f, i) => ({
    id: newId('PL-'),
    fixture: f.properties.id,
    areaHa: f.properties.area_ha,
    geometry: f.geometry,
    createdAt: new Date(now.getTime() - (plotFixtures.length - i) * 1000).toISOString(),
    inside: insidePoint(f.geometry),
  }));

  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: `Capture FPO ${tag}`, officePhone: arg('--phone') ?? null });
    await tx.insert(user).values({ id: agentId, name: `Capture agent ${tag}`, email: agentEmail, emailVerified: true, role: 'agent', orgId, createdAt: now, updatedAt: now });
    await tx.insert(account).values({ id: `${agentId}-credential`, accountId: agentId, providerId: 'credential', userId: agentId, password: hash, createdAt: now, updatedAt: now });
    if (withCode) await tx.insert(user).values({ id: adminId, name: `Capture admin ${tag}`, email: `admin-${tag}@capture.udgam.test`, emailVerified: true, role: 'admin', orgId, createdAt: now, updatedAt: now });
    await tx.insert(farmers).values({ id: farmerId, orgId, name: farmerName, producerId });
    for (const p of seeded) {
      const a = await append(tx, 'plot_registered', { plotId: p.id, producerId, crop: 'arabica', areaHa: p.areaHa, polygon: p.geometry });
      await tx.insert(plots).values({ id: p.id, farmerId, crop: 'arabica', geojson: JSON.stringify(p.geometry), areaHa: p.areaHa, anchorSeq: a.seq, createdAt: p.createdAt, updatedAt: p.createdAt });
      await tx.insert(agentPlots).values({ agentId, plotId: p.id, assignedAt: p.createdAt });
    }
    const d = await append(tx, 'device_enrolled', { deviceId, agentId, thumbprint: kid });
    await tx.insert(devices).values({ id: deviceId, agentId, publicKeyJwk: JSON.stringify(publicJwk), keyThumbprint: kid, enrolledAt: now.toISOString(), anchorSeq: d.seq });
  });

  let seq = 0;
  let last = 'genesis';
  const out: SeededCapture['events'] = [];
  for (const [i, e] of events.entries()) {
    const first = seeded[0]!;
    const isPhoto = photo && i === events.length - 1;
    const bytes = isPhoto ? readFileSync(photo) : randomBytes(64);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const size = isPhoto ? statSync(photo).size : bytes.length;
    // Oldest first, a day apart, ending an hour ago (the movement check sees a plausible history).
    const at = new Date(now.getTime() - (events.length - i) * 86_400_000 + 82_800_000).toISOString();
    const payload: CapturePayloadV1 = {
      v: 1,
      plotId: first.id,
      deviceId,
      seq: seq + 1,
      prevEventHash: last,
      capturedAt: at,
      gps: { lat: first.inside.lat, lng: first.inside.lng, accuracyM: 8 },
      cherryKg: e.kg,
      media: [{ sha256: sha, size, mime: 'image/jpeg' }],
    };
    const payloadString = jcs(payload);
    const payloadHash = await sha256Hex(payloadString);
    const signature = await sign(pair.privateKey, payloadString);
    const media: StoredMedia[] = [{ sha256: sha, size, mime: 'image/jpeg', path: `media/${sha.slice(0, 2)}/${sha}.jpg`, exif: { gps: null, takenAt: null, hadOffset: false } }];
    const ids = await writeTx(db, (tx) =>
      persistAccepted(tx, {
        payload,
        payloadString,
        payloadHash,
        signature,
        serverReceivedAt: at,
        device: { id: deviceId, agentId, publicJwk, revokedAt: null, lastSeq: seq, lastEventHash: seq === 0 ? null : last },
        media,
        result: result(e.verdict, e.why),
      }),
    );
    seq += 1;
    last = payloadHash;
    out.push({ eventId: ids.eventId, cherryKg: e.kg, verdict: e.verdict });
  }

  // One boundary refusal of this phone's next picking (attributable: signed by the enrolled key).
  let refusal: SeededCapture['refusal'];
  const refusalReason = arg('--refusal');
  if (refusalReason) {
    const first = seeded[0]!;
    const at = new Date(now.getTime() - 1_800_000).toISOString();
    const payload: CapturePayloadV1 = {
      v: 1,
      plotId: first.id,
      deviceId,
      seq: seq + 1,
      prevEventHash: last,
      capturedAt: at,
      gps: { lat: first.inside.lat, lng: first.inside.lng, accuracyM: 8 },
      cherryKg: 30,
      media: [{ sha256: createHash('sha256').update(randomBytes(64)).digest('hex'), size: 64, mime: 'image/jpeg' }],
    };
    const payloadString = jcs(payload);
    const { eventId } = await writeTx(db, (tx) =>
      persistRejected(tx, {
        payloadString,
        payloadHash: createHash('sha256').update(payloadString).digest('hex'),
        signature: 'test-only',
        serverReceivedAt: at,
        reason: refusalReason,
        payload,
        device: { id: deviceId, agentId, publicJwk, revokedAt: null, lastSeq: seq, lastEventHash: seq === 0 ? null : last },
      }),
    );
    refusal = { eventId, cherryKg: 30, reason: refusalReason };
  }

  const testOnlyCode = withCode ? (await issueCode(db, { agentId, adminId, orgId })).code : undefined;

  const seed: SeededCapture = {
    orgId,
    agentEmail,
    testOnlyAgentPassword: password,
    farmerName,
    deviceId,
    testOnlyPrivateJwk: privateJwk,
    nextSeq: seq + 1,
    lastEventHash: last,
    plots: seeded.map(({ id, fixture, areaHa, inside }) => ({ id, fixture, areaHa, inside })),
    events: out,
    ...(refusal ? { refusal } : {}),
    ...(testOnlyCode ? { testOnlyCode } : {}),
  };
  console.log(JSON.stringify(seed));
} finally {
  closeDb();
}

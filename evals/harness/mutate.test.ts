import { booleanPointInPolygon, point } from '@turf/turf';
import { beforeAll, describe, expect, it } from 'vitest';
import { jcs, sha256Hex, verify as verifySignature } from '../../src/lib/crypto';
import { distanceToEdgeM, haversineM } from '../../src/lib/geo/distance';
import { ProviderError } from '../../src/lib/remote-sensing/types';
import { generateDeviceKeys, loadHarnessInputs, PLACEHOLDER_YIELD_REFERENCE, SERVER_RECEIVED_AT, type DeviceKeys, type HarnessInputs } from './context';
import { loadDataset, type EvalCase, type Mutation } from './dataset';
import { buildCase, InvalidMutationParam, UnknownMutationOp, type BuiltCase } from './mutate';

// TC-014: each evaluation-plan §7.3 op makes exactly its change to (Submission, VerifyContext);
// an unknown op throws; buildCase is pure per case. Expected values are literals from the spec.

const ds = loadDataset();
let inputs: HarnessInputs;
let keys: DeviceKeys;
const cases = new Map(ds.cases.map((c) => [c.id, c]));
const kase = (id: string) => cases.get(id)!;
const build = (id: string | EvalCase) => buildCase(typeof id === 'string' ? kase(id) : id, inputs, keys);

/** A synthetic case on top of EVAL-001 (for ops the seeded harness cases do not use). */
const synthetic = (mutations: Mutation[], over: Partial<EvalCase['input']> = {}): EvalCase => ({
  ...kase('EVAL-001'),
  id: 'EVAL-900',
  input: { plot: 'P01', device: 'D-A1', base_case: 'EVAL-001', mutations, ...over },
});

const inside = (b: BuiltCase) => booleanPointInPolygon(point([b.submission.payload.gps.lng, b.submission.payload.gps.lat]), b.context.plot.polygon);
const edgeM = (b: BuiltCase) => distanceToEdgeM(b.submission.payload.gps, b.context.plot.polygon);
const minutes = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 60_000;
const ratioU = (b: BuiltCase, kg: number) => (kg * b.context.yieldReference.cherryToCleanRatio) / b.context.plot.areaHa / b.context.yieldReference.maxKgHa;

beforeAll(async () => {
  inputs = loadHarnessInputs(ds);
  keys = await generateDeviceKeys(ds);
});

describe('the base case EVAL-001', () => {
  it('is a signed genesis capture at the P01 centroid with every default the dataset names', async () => {
    const b = await build('EVAL-001');
    const p = b.submission.payload;
    expect(p).toMatchObject({ v: 1, plotId: 'P01', deviceId: 'D-A1', seq: 1, prevEventHash: 'genesis' });
    expect(p.gps.accuracyM).toBe(8);
    expect(p.media).toHaveLength(2);
    expect(inside(b)).toBe(true);
    expect(b.submission.serverReceivedAt).toBe(SERVER_RECEIVED_AT);
    expect(await verifySignature(b.context.device.publicJwk, jcs(p), b.submission.signature)).toBe(true);
    expect(b.context.device).toMatchObject({ id: 'D-A1', revokedAt: null, lastSeq: 0, lastEventHash: null });
    expect(b.context.agentPriorAcceptedEvents).toBe(0);
    expect(b.context.previousEvent).toBeNull();
    expect(b.context.plot).toMatchObject({ id: 'P01', crop: 'arabica', areaHa: 2 });
    expect(b.context.yieldReference).toEqual(PLACEHOLDER_YIELD_REFERENCE);
    expect(PLACEHOLDER_YIELD_REFERENCE).toMatchObject({ maxKgHa: 1000, cherryToCleanRatio: 0.2, source: 'placeholder' });
    expect(b.providerFaults).toEqual([]);
    expect(b.throwCheck).toBeUndefined();
  });
});

describe('gps_place', () => {
  it('outside_edge 2400 puts the point 2400 ± 1 m from the nearest edge, outside (EVAL-022)', async () => {
    const b = await build('EVAL-022');
    expect(inside(b)).toBe(false);
    expect(Math.abs(edgeM(b) - 2400)).toBeLessThan(1);
  });

  it('inside_near_edge 40 is inside, 40 ± 1 m from the nearest edge (EVAL-002)', async () => {
    const b = await build('EVAL-002');
    expect(inside(b)).toBe(true);
    expect(Math.abs(edgeM(b) - 40)).toBeLessThan(1);
  });

  it('outside_edge 12 on P08 is outside, 12 ± 1 m (EVAL-009)', async () => {
    const b = await build('EVAL-009');
    expect(inside(b)).toBe(false);
    expect(Math.abs(edgeM(b) - 12)).toBeLessThan(1);
  });

  it('P04 inside_near_edge 15 is inside the L, 15 ± 1 m from the notch edge (EVAL-005)', async () => {
    const b = await build('EVAL-005');
    const notch = inputs.plots.P04!.properties.notch!;
    expect(inside(b)).toBe(true);
    expect(Math.abs(edgeM(b) - 15)).toBeLessThan(1);
    expect(Math.abs(distanceToEdgeM(b.submission.payload.gps, notch) - 15)).toBeLessThan(1);
  });

  it('P04 outside_notch 40 is in the notch (outside the L, inside its bbox), 40 ± 1 m from the edge (EVAL-026)', async () => {
    const b = await build('EVAL-026');
    const notch = inputs.plots.P04!.properties.notch!;
    expect(inside(b)).toBe(false);
    expect(booleanPointInPolygon(point([b.submission.payload.gps.lng, b.submission.payload.gps.lat]), notch)).toBe(true);
    expect(Math.abs(edgeM(b) - 40)).toBeLessThan(1);
  });

  it('inside_near_edge deeper than the plot allows stays inside, as deep as it can, with a note (EVAL-013: 40 m on 0.6 ha P02)', async () => {
    const b = await build('EVAL-013');
    expect(inside(b)).toBe(true);
    expect(edgeM(b)).toBeGreaterThan(30);
    expect(edgeM(b)).toBeLessThan(40);
    expect(b.notes).toEqual([expect.stringMatching(/inside_near_edge 40 m .* P02/)]);
    expect((await build('EVAL-002')).notes).toEqual([]);
  });

  it('inside_centroid is inside and rounded to 7 dp like the phone payload', async () => {
    const b = await build('EVAL-023');
    expect(inside(b)).toBe(true);
    const { lat, lng } = b.submission.payload.gps;
    expect(Math.round(lat * 1e7) / 1e7).toBe(lat);
    expect(Math.round(lng * 1e7) / 1e7).toBe(lng);
  });
});

describe('gps_accuracy', () => {
  it('sets the reported accuracy radius (EVAL-010: 28 m; EVAL-020: 150 m)', async () => {
    expect((await build('EVAL-010')).submission.payload.gps.accuracyM).toBe(28);
    expect((await build('EVAL-020')).submission.payload.gps.accuracyM).toBe(150);
  });
});

describe('exif_gps', () => {
  it('offset 3200 puts every photo 3200 ± 1 m due east of the phone GPS (EVAL-023)', async () => {
    const b = await build('EVAL-023');
    for (const m of b.submission.media) {
      expect(Math.abs(haversineM(m.exif.gps!, b.submission.payload.gps) - 3200)).toBeLessThan(1);
      expect(m.exif.gps!.lng).toBeGreaterThan(b.submission.payload.gps.lng);
    }
  });

  it('match is the same point (EVAL-022); absent is null on every photo (EVAL-007)', async () => {
    const m = await build('EVAL-022');
    for (const x of m.submission.media) expect(x.exif.gps).toEqual({ lat: m.submission.payload.gps.lat, lng: m.submission.payload.gps.lng });
    const a = await build('EVAL-007');
    for (const x of a.submission.media) expect(x.exif.gps).toBeNull();
  });
});

describe('exif_time', () => {
  it('offset −9 min is 9 min before the client time (EVAL-011)', async () => {
    const b = await build('EVAL-011');
    for (const m of b.submission.media) expect(minutes(m.exif.takenAt!, b.submission.payload.capturedAt)).toBe(-9);
  });

  it('offset −64800 min is 45 days before (EVAL-033); match equals client time (EVAL-035); absent is null (EVAL-036)', async () => {
    const b = await build('EVAL-033');
    expect(minutes(b.submission.media[0]!.exif.takenAt!, b.submission.payload.capturedAt)).toBe(-64800);
    const m = await build('EVAL-035');
    expect(m.submission.media[0]!.exif.takenAt).toBe(m.submission.payload.capturedAt);
    const a = await build('EVAL-036');
    for (const x of a.submission.media) expect(x.exif.takenAt).toBeNull();
  });
});

describe('client_clock', () => {
  it('offset 0 → the capture time is the server receipt time (EVAL-001)', async () => {
    const b = await build('EVAL-001');
    expect(b.submission.payload.capturedAt).toBe(b.submission.serverReceivedAt);
  });

  it('offset −14400 → the client clock is 10 days behind the server (EVAL-035)', async () => {
    const b = await build('EVAL-035');
    expect(minutes(b.submission.payload.capturedAt, b.submission.serverReceivedAt)).toBe(-14400);
  });
});

describe('prev_event', () => {
  it('45 km, 8 min earlier → implied speed rounds to 338 km/h (EVAL-024)', async () => {
    const b = await build('EVAL-024');
    const prev = b.context.previousEvent!;
    const d = haversineM(prev, b.submission.payload.gps);
    expect(d).toBeGreaterThanOrEqual(45_000);
    expect(d).toBeLessThan(45_000.01);
    expect(minutes(b.submission.payload.capturedAt, prev.capturedAt)).toBe(8);
    expect(Math.round(d / 1000 / (8 / 60))).toBe(338);
  });

  it('25 km, 10 min → 150 km/h (EVAL-028); none → null (EVAL-001)', async () => {
    const b = await build('EVAL-028');
    expect(Math.round(haversineM(b.context.previousEvent!, b.submission.payload.gps) / 1000 / (10 / 60))).toBe(150);
    expect((await build('EVAL-001')).context.previousEvent).toBeNull();
  });
});

describe('reuse_media', () => {
  it('which all copies every hash of the source case and seeds seenMediaHashes (EVAL-030)', async () => {
    const src = await build('EVAL-001');
    const b = await build('EVAL-030');
    const hashes = b.submission.media.map((m) => m.sha256);
    expect(hashes).toEqual(src.submission.media.map((m) => m.sha256));
    expect(b.submission.payload.media.map((m) => m.sha256)).toEqual(hashes);
    expect([...b.context.seenMediaHashes].sort()).toEqual([...hashes].sort());
  });

  it('which one reuses 1 of 3 (EVAL-032)', async () => {
    const b = await build('EVAL-032');
    expect(b.submission.media).toHaveLength(3);
    expect(b.submission.media.filter((m) => b.context.seenMediaHashes.has(m.sha256))).toHaveLength(1);
  });

  it('transform re-encode gives fresh hashes, so none is seen (EVAL-036)', async () => {
    const src = await build('EVAL-001');
    const b = await build('EVAL-036');
    for (const m of b.submission.media) expect(src.submission.media.map((x) => x.sha256)).not.toContain(m.sha256);
    expect(b.context.seenMediaHashes.size).toBe(0);
  });

  it('an honest case has fresh hashes and an empty seen set (EVAL-002)', async () => {
    const b = await build('EVAL-002');
    expect(b.context.seenMediaHashes.size).toBe(0);
    expect(new Set(b.submission.media.map((m) => m.sha256)).size).toBe(2);
  });
});

describe('chain', () => {
  it('seq_delta 1, prev_hash correct → entry 13 after the device head at 12 (EVAL-002)', async () => {
    const b = await build('EVAL-002');
    expect(b.context.device.lastSeq).toBe(12);
    expect(b.submission.payload.seq).toBe(13);
    expect(b.context.device.lastEventHash).toBe(await sha256Hex('harness/D-A1/event/12'));
    expect(b.submission.payload.prevEventHash).toBe(await sha256Hex('harness/D-A1/event/12'));
    expect(b.context.agentPriorAcceptedEvents).toBe(12);
  });

  it('seq_delta −2, prev_hash stale → seq 10 carrying the stale hash of entry 9 (EVAL-035)', async () => {
    const b = await build('EVAL-035');
    const dev = b.submission.payload.deviceId;
    expect(b.context.device.lastSeq).toBe(12);
    expect(b.submission.payload.seq).toBe(10);
    expect(b.submission.payload.prevEventHash).toBe(await sha256Hex(`harness/${dev}/event/9`));
    expect(b.submission.payload.prevEventHash).not.toBe(b.context.device.lastEventHash);
  });

  it('prev_hash genesis on re-enrolled D-A3 → seq 1 on a fresh device while agent-A has earlier entries (EVAL-021)', async () => {
    const b = await build('EVAL-021');
    expect(b.submission.payload).toMatchObject({ deviceId: 'D-A3', seq: 1, prevEventHash: 'genesis' });
    expect(b.context.device).toMatchObject({ id: 'D-A3', lastSeq: 0, lastEventHash: null });
    expect(b.context.agentPriorAcceptedEvents).toBeGreaterThan(0);
  });
});

describe('season_cumulative', () => {
  it('2.05 → the season ratio after this event is 2.05 ± 0.001 U (EVAL-046)', async () => {
    const b = await build('EVAL-046');
    expect(Math.abs(ratioU(b, b.context.seasonCherryKgBefore + b.submission.payload.cherryKg) - 2.05)).toBeLessThan(0.001);
  });

  it('1.8 → 2.1 sets both sides: before 1.8 ± 0.001, after 2.1 ± 0.001 (EVAL-049)', async () => {
    const b = await build('EVAL-049');
    expect(Math.abs(ratioU(b, b.context.seasonCherryKgBefore) - 1.8)).toBeLessThan(0.001);
    expect(Math.abs(ratioU(b, b.context.seasonCherryKgBefore + b.submission.payload.cherryKg) - 2.1)).toBeLessThan(0.001);
    expect(Number.isInteger(b.submission.payload.cherryKg * 2)).toBe(true);
  });

  it('0.3 on P01 with the default 42.5 kg picking (EVAL-001)', async () => {
    const b = await build('EVAL-001');
    expect(b.submission.payload.cherryKg).toBe(42.5);
    expect(Math.abs(ratioU(b, b.context.seasonCherryKgBefore + 42.5) - 0.3)).toBeLessThan(0.001);
  });
});

describe('photos', () => {
  it('count 3 → three distinct photos in the payload and the submission (EVAL-004); count 1 (EVAL-014)', async () => {
    const b = await build('EVAL-004');
    expect(b.submission.payload.media).toHaveLength(3);
    expect(b.submission.media).toHaveLength(3);
    expect(new Set(b.submission.media.map((m) => m.sha256)).size).toBe(3);
    expect((await build('EVAL-014')).submission.media).toHaveLength(1);
  });
});

describe('provider_fault', () => {
  it('gfw http_500 with an empty cache is handed to the fixture provider (EVAL-017)', async () => {
    const b = await build('EVAL-017');
    expect(b.providerFaults).toEqual([{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }]);
    const plot = { id: b.context.plot.id, polygon: b.context.plot.polygon, areaHa: b.context.plot.areaHa, geometryHash: 'not-used-by-the-fixture' };
    await expect(b.context.remoteSensing.forestLoss(plot)).rejects.toEqual(new ProviderError('gfw', 500));
    await expect(b.context.remoteSensing.ndviWindow(plot, '2026-12-08', 30)).resolves.toEqual({ mean: 0.71, clearObservations: 4, source: 'fixture' });
  });

  it('sentinel-hub timeout (EVAL-016)', async () => {
    expect((await build('EVAL-016')).providerFaults).toEqual([{ provider: 'sentinel-hub', mode: 'timeout', cacheEmpty: false }]);
  });
});

describe('check_throws', () => {
  it('names the check and the error class (EVAL-018)', async () => {
    expect((await build('EVAL-018')).throwCheck).toEqual({ check: 'movement_plausibility', error: 'TypeError' });
  });
});

describe('device', () => {
  it('state revoked → the device record carries a revocation time', async () => {
    const b = await build(synthetic([{ op: 'device', state: 'revoked' }]));
    expect(b.context.device.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(b.context.device.revokedAt!)).toBeLessThan(Date.parse(b.submission.serverReceivedAt));
  });

  it('D-A2 is revoked by its fixture state', async () => {
    const b = await build(synthetic([], { device: 'D-A2' }));
    expect(b.context.device).toMatchObject({ id: 'D-A2' });
    expect(b.context.device.revokedAt).not.toBeNull();
  });

  it('state unknown → signed with the never-enrolled K-X key, so it does not verify under D-A1', async () => {
    const b = await build(synthetic([{ op: 'device', state: 'unknown' }]));
    expect(b.submission.payload.deviceId).toBe('D-A1');
    expect(await verifySignature(b.context.device.publicJwk, jcs(b.submission.payload), b.submission.signature)).toBe(false);
    expect(await verifySignature(keys['K-X']!.publicJwk, jcs(b.submission.payload), b.submission.signature)).toBe(true);
  });
});

describe('tamper_after_sign', () => {
  it('changes the field after signing, so the signature no longer verifies', async () => {
    const clean = await build('EVAL-001');
    const b = await build(synthetic([{ op: 'tamper_after_sign', field: 'cherryKg' }]));
    expect(b.submission.payload.cherryKg).not.toBe(clean.submission.payload.cherryKg);
    expect(await verifySignature(b.context.device.publicJwk, jcs(b.submission.payload), b.submission.signature)).toBe(false);
  });

  it('works on a nested field (gps.lat)', async () => {
    const clean = await build('EVAL-001');
    const b = await build(synthetic([{ op: 'tamper_after_sign', field: 'gps.lat' }]));
    expect(b.submission.payload.gps.lat).not.toBe(clean.submission.payload.gps.lat);
    expect(await verifySignature(b.context.device.publicJwk, jcs(b.submission.payload), b.submission.signature)).toBe(false);
  });
});

describe('errors and purity', () => {
  it('an unknown op throws UnknownMutationOp', async () => {
    await expect(build(synthetic([{ op: 'teleport' }]))).rejects.toBeInstanceOf(UnknownMutationOp);
  });

  it('an unknown op parameter throws InvalidMutationParam naming the op and the key', async () => {
    const typo = build(synthetic([{ op: 'gps_place', where: 'outside_edge', distnace_m: 30 }]));
    await expect(typo).rejects.toBeInstanceOf(InvalidMutationParam);
    await expect(build(synthetic([{ op: 'gps_place', where: 'outside_edge', distnace_m: 30 }]))).rejects.toThrow(/gps_place.*distnace_m/);
    await expect(build(synthetic([{ op: 'chain', seq_delta: 1, prev_hash: 'correct', prevhash: 'stale' }]))).rejects.toBeInstanceOf(InvalidMutationParam);
  });

  it('a bad enum value throws InvalidMutationParam (provider_fault cache "emtpy", exif_gps mode "offest")', async () => {
    await expect(build(synthetic([{ op: 'provider_fault', provider: 'gfw', mode: 'http_500', cache: 'emtpy' }]))).rejects.toBeInstanceOf(InvalidMutationParam);
    await expect(build(synthetic([{ op: 'exif_gps', mode: 'offest', distance_m: 10 }]))).rejects.toBeInstanceOf(InvalidMutationParam);
    await expect(build(synthetic([{ op: 'prev_event', none: 'yes' }]))).rejects.toBeInstanceOf(InvalidMutationParam);
  });

  it('a free-text note is allowed on any op, and cache "empty" is accepted', async () => {
    const b = await build(synthetic([{ op: 'provider_fault', provider: 'gfw', mode: 'http_500', cache: 'empty', note: 'why' }]));
    expect(b.providerFaults).toEqual([{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }]);
  });

  it('proof_tamper belongs to the harness-proof suite and is refused here', async () => {
    await expect(build(synthetic([{ op: 'proof_tamper', target: 'merkle_sibling' }]))).rejects.toThrow(/harness-proof/);
  });

  it('buildCase is pure per case: same inputs → same case, nothing shared or mutated', async () => {
    const frozen = structuredClone(kase('EVAL-032'));
    const strip = (b: BuiltCase) => ({ ...b, submission: { ...b.submission, signature: '' }, context: { ...b.context, remoteSensing: null } });
    const first = await build('EVAL-032');
    await build('EVAL-030'); // another case in between must not leak into this one
    await build('EVAL-001');
    const second = await build('EVAL-032');
    expect(strip(second)).toEqual(strip(first));
    expect(kase('EVAL-032')).toEqual(frozen);
    expect(first.context.seenMediaHashes).not.toBe(second.context.seenMediaHashes);
    expect(first.context.remoteSensing).not.toBe(second.context.remoteSensing);
  });

  it('every runnable harness-verifier case builds', async () => {
    const runnable = ds.cases.filter((c) => c.suite === 'harness-verifier' && (c.status === 'active' || c.status === 'stretch'));
    expect(runnable.length).toBeGreaterThanOrEqual(52);
    for (const c of runnable) await expect(build(c), c.id).resolves.toBeDefined();
  });
});

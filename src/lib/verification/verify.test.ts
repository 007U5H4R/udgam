import { describe, expect, it } from 'vitest';
import {
  CENTRE,
  makeContext,
  makeDevice,
  makeSubmission,
  northOfTop,
  photoHash,
} from '../../../tests/helpers/verify';
import { CONFIG, CONFIG_HASH } from './config';
import { REGISTRY, type Check } from './registry';
import { CHECK_IDS, type CheckResult, type Submission } from './types';
import { runCheck, verify, verifyWith } from './verify';

/** The TKT-02 checks: the verify() mechanics below are tested over them, whatever else is registered. */
const CORE = REGISTRY.filter((c) => ['signature_valid', 'photo_uniqueness', 'geofence'].includes(c.id));
/** Photos whose EXIF agrees with the phone (same place, same time), as an honest capture's do. */
const withMatchingExif = (sub: Submission): Submission => ({
  ...sub,
  media: sub.media.map((m) => ({ ...m, exif: { gps: { lat: sub.payload.gps.lat, lng: sub.payload.gps.lng }, takenAt: sub.payload.capturedAt } })),
});

describe('registry', () => {
  it('holds all twelve checks in §6.3 order', () => {
    expect(REGISTRY.map((c) => [c.id, c.kind])).toEqual([
      ['signature_valid', 'local'],
      ['chain_continuity', 'local'],
      ['photo_uniqueness', 'local'],
      ['geofence', 'local'],
      ['gps_accuracy', 'local'],
      ['exif_gps_agreement', 'local'],
      ['exif_time_agreement', 'local'],
      ['movement_plausibility', 'local'],
      ['deforestation_overlap', 'remote'],
      ['ndvi_cultivation', 'remote'],
      ['ndvi_harvest_window', 'remote'],
      ['yield_plausibility', 'local'],
    ]);
    expect(REGISTRY.map((c) => c.id)).toEqual([...CHECK_IDS]);
  });
});

describe('signature_valid', () => {
  it('ok with the enrolled, unrevoked key', async () => {
    const d = await makeDevice('DV-AAAA0001');
    const res = await verify(await makeSubmission({ device: d }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'signature_valid')).toMatchObject({
      status: 'ok',
      hardFail: false,
      evidence: 'Signed by enrolled phone DV-AAAA0001',
    });
  });

  it('hard fail when the payload was changed after signing (EVAL-053 at check level)', async () => {
    const d = await makeDevice('DV-AAAA0001');
    const sub = await makeSubmission({ device: d, cherryKg: 42.5 });
    const tampered = { ...sub, payload: { ...sub.payload, cherryKg: 142.5 } };
    const res = await verify(tampered, makeContext(d));
    expect(res.checks.find((c) => c.id === 'signature_valid')).toMatchObject({
      status: 'fail',
      hardFail: true,
      evidence: 'Signature does not match phone DV-AAAA0001',
    });
    expect(res.verdict).toBe('Rejected');
  });

  it('hard fail when the phone was revoked', async () => {
    const d = await makeDevice('DV-AAAA0001');
    const ctx = makeContext(d);
    ctx.device.revokedAt = '2026-10-01T06:00:00.000Z';
    const res = await verify(await makeSubmission({ device: d }), ctx);
    expect(res.checks.find((c) => c.id === 'signature_valid')).toMatchObject({
      status: 'fail',
      hardFail: true,
      evidence: 'Phone DV-AAAA0001 was revoked on 2026-10-01',
    });
    expect(res.verdict).toBe('Rejected');
  });

  it('hard fail when another key signed it', async () => {
    const d = await makeDevice('DV-AAAA0001');
    const other = await makeDevice('DV-AAAA0001');
    const res = await verify(await makeSubmission({ device: other }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'signature_valid')).toMatchObject({ status: 'fail', hardFail: true });
  });
});

describe('geofence', () => {
  it('ok inside', async () => {
    const d = await makeDevice();
    const res = await verify(await makeSubmission({ device: d, gps: { ...CENTRE, accuracyM: 8 } }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'geofence')).toMatchObject({ status: 'ok', evidence: 'Inside the plot, 71 m from the edge' });
  });

  it('flag within the GPS allowance (EVAL-009: 12 m out, 20 m accuracy)', async () => {
    const d = await makeDevice();
    const res = await verify(await makeSubmission({ device: d, gps: { ...northOfTop(12), accuracyM: 20 } }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'geofence')).toMatchObject({
      status: 'flag',
      hardFail: false,
      evidence: '12 m outside the plot edge, within the 20 m GPS allowance',
    });
  });

  it('EVAL-022 agent submits from home 2.4 km outside the plot → geofence fail, never Verified', async () => {
    const d = await makeDevice();
    const res = await verify(await makeSubmission({ device: d, gps: { ...northOfTop(2400), accuracyM: 8 } }), makeContext(d));
    const g = res.checks.find((c) => c.id === 'geofence')!;
    expect(g).toMatchObject({ status: 'fail', hardFail: false });
    expect(g.evidence).toContain('2400 m');
    expect(['Needs Review', 'Rejected']).toContain(res.verdict);
    expect(res.capReasons).toContain('anyFail');
  });
});

describe('photo_uniqueness', () => {
  it('ok when every photo is new', async () => {
    const d = await makeDevice();
    const res = await verify(await makeSubmission({ device: d, mediaHashes: [photoHash(1), photoHash(2), photoHash(3)] }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'ok', evidence: '3 of 3 photos are new' });
  });

  it('CR-001: one photo filling all three slots counts as one photo ("1 of 1 photos are new"), verdict unchanged', async () => {
    const d = await makeDevice();
    const same = photoHash(1);
    const res = await verify(await makeSubmission({ device: d, mediaHashes: [same, same, same] }), makeContext(d));
    expect(res.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'ok', hardFail: false, evidence: '1 of 1 photos are new' });
  });

  it('CR-001: a repeated photo is counted once when it was seen before ("1 of 2 photos seen before")', async () => {
    const d = await makeDevice();
    const sub = await makeSubmission({ device: d, mediaHashes: [photoHash(1), photoHash(1), photoHash(2)] });
    const res = await verify(sub, makeContext(d, { seenMediaHashes: new Set([photoHash(1)]) }));
    expect(res.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'fail', hardFail: true, evidence: '1 of 2 photos seen before' });
  });

  it('hard fail naming "1 of 3" when one photo was seen before (EVAL-032 shape)', async () => {
    const d = await makeDevice();
    const sub = await makeSubmission({ device: d, mediaHashes: [photoHash(1), photoHash(2), photoHash(3)] });
    const res = await verify(sub, makeContext(d, { seenMediaHashes: new Set([photoHash(2)]) }));
    expect(res.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({
      status: 'fail',
      hardFail: true,
      evidence: '1 of 3 photos seen before',
    });
    expect(res.verdict).toBe('Rejected');
  });

  it('EVAL-030 exact photo bytes from an accepted capture reused → Rejected by photo_uniqueness', async () => {
    const d = await makeDevice();
    const reused = [photoHash(1), photoHash(2)];
    const sub = await makeSubmission({ device: d, mediaHashes: reused, seq: 2, gps: { ...northOfTop(-40), accuracyM: 8 } });
    const res = await verify(sub, makeContext(d, { seenMediaHashes: new Set(reused) }));
    expect(res.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'fail', hardFail: true });
    expect(res.verdict).toBe('Rejected');
  });
});

describe('verify() (§6.1)', () => {
  it('EVAL-001 clean capture at plot centre, first event on the device → Verified', async () => {
    const d = await makeDevice();
    const res = await verify(withMatchingExif(await makeSubmission({ device: d, gps: { ...CENTRE, accuracyM: 8 } })), makeContext(d));
    expect(res).toMatchObject({ verdict: 'Verified', score: 100, capReasons: [], unavailableProviders: [] });
    expect(res.checks.map((c) => c.status)).toEqual(REGISTRY.map(() => 'ok'));
    expect(res.config).toEqual({ version: 'cfg-1', hash: CONFIG_HASH });
  });

  it('EVAL-002 second capture 45 minutes later, 40 m inside the edge → Verified', async () => {
    const d = await makeDevice();
    const first = await makeSubmission({ device: d, mediaHashes: [photoHash(1), photoHash(2)] });
    const sub = await makeSubmission({
      device: d,
      seq: 2,
      prevEventHash: first.payloadHash,
      capturedAt: '2026-10-14T04:57:33.120Z',
      gps: { ...northOfTop(-40), accuracyM: 8 },
      mediaHashes: [photoHash(3), photoHash(4)],
    });
    const ctx = makeContext(d, {
      previousEvent: { ...CENTRE, capturedAt: '2026-10-14T04:12:33.120Z' },
      seenMediaHashes: new Set(), // only this submission's hashes are ever looked up
    });
    ctx.device.lastSeq = 1;
    ctx.device.lastEventHash = first.payloadHash;
    const res = await verify(withMatchingExif(sub), ctx);
    expect(res.verdict).toBe('Verified');
    expect(res.checks.find((c) => c.id === 'geofence')?.evidence).toBe('Inside the plot, 40 m from the edge');
  });

  it('fills weight and score from cfg-1 and returns checks in registry order', async () => {
    const d = await makeDevice();
    const res = await verifyWith(CORE, await makeSubmission({ device: d, gps: { ...northOfTop(12), accuracyM: 20 } }), makeContext(d));
    expect(res.checks.map((c) => [c.id, c.weight, c.score])).toEqual([
      ['signature_valid', 1, 1],
      ['photo_uniqueness', 1, 1],
      ['geofence', 1, 0.5],
    ]);
  });

  it('calls onCheck once per finished check', async () => {
    const d = await makeDevice();
    const seen: string[] = [];
    await verifyWith(CORE, await makeSubmission({ device: d }), makeContext(d), { onCheck: (r) => seen.push(`${r.id}:${r.status}`) });
    expect(seen.sort()).toEqual(['geofence:ok', 'photo_uniqueness:ok', 'signature_valid:ok']);
  });

  it('opts.enabled runs only the named checks (--config=ledger-only)', async () => {
    const d = await makeDevice();
    const res = await verify(await makeSubmission({ device: d, gps: { ...northOfTop(2400), accuracyM: 8 } }), makeContext(d), {
      enabled: ['signature_valid'],
    });
    expect(res.checks.map((c) => c.id)).toEqual(['signature_valid']);
    expect(res.verdict).toBe('Verified');
  });

  it('a throwing onCheck callback does not break verify()', async () => {
    const d = await makeDevice();
    const res = await verifyWith(CORE, await makeSubmission({ device: d }), makeContext(d), {
      onCheck: () => {
        throw new Error('listener broke');
      },
    });
    expect(res.verdict).toBe('Verified');
  });
});

describe('a throwing check (TC-012, EVAL-018, CF-03)', () => {
  const thrower: Check = {
    id: 'movement_plausibility',
    kind: 'local',
    run: async () => {
      throw new TypeError('Cannot read properties of undefined');
    },
  };

  it('runCheck turns a throw into unavailable with "Check could not run: TypeError"', async () => {
    const d = await makeDevice();
    const r = await runCheck(thrower, await makeSubmission({ device: d }), makeContext(d), CONFIG);
    expect(r).toEqual({
      id: 'movement_plausibility',
      status: 'unavailable',
      score: 0,
      weight: 1,
      hardFail: false,
      evidence: 'Check could not run: TypeError',
    });
  });

  it('EVAL-018 the other checks still run and the verdict is Needs Review, never Rejected; verify() resolves', async () => {
    const d = await makeDevice();
    const res = await verifyWith([...CORE, thrower], await makeSubmission({ device: d }), makeContext(d));
    expect(res.checks.map((c) => [c.id, c.status])).toEqual([
      ['signature_valid', 'ok'],
      ['photo_uniqueness', 'ok'],
      ['geofence', 'ok'],
      ['movement_plausibility', 'unavailable'],
    ]);
    expect(res.checks.find((c) => c.id === 'movement_plausibility')?.evidence).toContain('TypeError');
    expect(res.verdict).toBe('Needs Review');
    expect(res.capReasons).toEqual(['anyUnavailable']);
  });

  it('a non-Error throw is still unavailable', async () => {
    const d = await makeDevice();
    const weird: Check = { ...thrower, run: () => Promise.reject('just a string') };
    const r = await runCheck(weird, await makeSubmission({ device: d }), makeContext(d), CONFIG);
    expect(r).toMatchObject({ status: 'unavailable', evidence: 'Check could not run: string' });
  });
});

describe('remote phase', () => {
  const slow = (id: CheckResult['id'], provider: 'gfw' | 'sentinel-hub', ms: number): Check => ({
    id,
    kind: 'remote',
    provider,
    run: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ id, status: 'ok', hardFail: false, evidence: 'late' }), ms),
      ),
  });

  it('runs after the local checks and marks checks still running at the phase cap unavailable with their provider', async () => {
    const d = await makeDevice();
    const order: string[] = [];
    const config = { ...CONFIG, providers: { ...CONFIG.providers, remotePhaseCapMs: 50 } };
    const res = await verifyWith(
      [...CORE, slow('deforestation_overlap', 'gfw', 5), slow('ndvi_harvest_window', 'sentinel-hub', 5_000)],
      await makeSubmission({ device: d }),
      makeContext(d),
      { onCheck: (r) => order.push(r.id) },
      config,
    );
    expect(order.slice(0, 3).sort()).toEqual(['geofence', 'photo_uniqueness', 'signature_valid']);
    expect(order[3]).toBe('deforestation_overlap');
    expect(res.checks.find((c) => c.id === 'ndvi_harvest_window')).toMatchObject({
      status: 'unavailable',
      provider: 'sentinel-hub',
      evidence: 'Satellite NDVI data unavailable: no answer within 0.05 s; an admin re-run will retry',
    });
    expect(res.unavailableProviders).toEqual(['sentinel-hub']);
    expect(res.verdict).toBe('Needs Review');
  });
});

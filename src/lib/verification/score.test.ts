import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { describe, expect, it } from 'vitest';
import { CONFIG, CONFIG_HASH, type VerifyConfig } from './config';
import { score } from './score';
import { CHECK_IDS, type CheckId, type CheckResult, type CheckStatus } from './types';

// TC-009. Expected numbers are the spec's literals (technical-plan §6.2, test-cases TC-009).
function r(id: CheckId, status: CheckStatus, hardFail = false): CheckResult {
  return { id, status, score: 0, weight: 1, hardFail, evidence: '' };
}
function twelve(over: Partial<Record<CheckId, CheckStatus | 'hardFail'>> = {}): CheckResult[] {
  return CHECK_IDS.map((id) => {
    const s = over[id];
    return s === 'hardFail' ? r(id, 'fail', true) : r(id, s ?? 'ok');
  });
}
function withWeights(w: Partial<Record<CheckId, number>>): VerifyConfig {
  return { ...CONFIG, weights: { ...CONFIG.weights, ...w } };
}

describe('score (TC-009)', () => {
  it('12 ok → 100, Verified', () => {
    expect(score(twelve())).toEqual({ verdict: 'Verified', score: 100, capReasons: [] });
  });

  it('one geofence flag → 95.8, Verified', () => {
    expect(score(twelve({ geofence: 'flag' }))).toEqual({ verdict: 'Verified', score: 95.8, capReasons: [] });
  });

  it('one fail anywhere → 91.7 but Needs Review (anyFail)', () => {
    for (const id of ['geofence', 'gps_accuracy', 'movement_plausibility', 'ndvi_cultivation'] as const) {
      expect(score(twelve({ [id]: 'fail' }))).toEqual({ verdict: 'Needs Review', score: 91.7, capReasons: ['anyFail'] });
    }
  });

  it('a flag on deforestation_overlap or yield_plausibility → Needs Review', () => {
    expect(score(twelve({ deforestation_overlap: 'flag' }))).toEqual({
      verdict: 'Needs Review',
      score: 95.8,
      capReasons: ['flag:deforestation_overlap'],
    });
    expect(score(twelve({ yield_plausibility: 'flag' }))).toEqual({
      verdict: 'Needs Review',
      score: 95.8,
      capReasons: ['flag:yield_plausibility'],
    });
  });

  it('an unavailable check is excluded from the mean and caps at Needs Review', () => {
    // 11 ok over 11 scored checks = 100; the unavailable one is not counted as 0.
    expect(score(twelve({ ndvi_harvest_window: 'unavailable' }))).toEqual({
      verdict: 'Needs Review',
      score: 100,
      capReasons: ['anyUnavailable'],
    });
    // 10.5 of 11 → 95.5 (not 10.5 of 12 = 87.5)
    expect(score(twelve({ deforestation_overlap: 'unavailable', geofence: 'flag' })).score).toBe(95.5);
  });

  it('any hard fail → Rejected even at 91.7', () => {
    expect(score(twelve({ photo_uniqueness: 'hardFail' }))).toEqual({ verdict: 'Rejected', score: 91.7, capReasons: ['anyFail'] });
    expect(score(twelve({ signature_valid: 'hardFail' })).verdict).toBe('Rejected');
  });

  it('boundaries via weights: 79.9 → Needs Review, 80.0 → Verified', () => {
    // (299×1 + 201×0.5) / 500 = 79.9 ; (3×1 + 2×0.5) / 5 = 80.0
    const two = (s: CheckStatus) => [r('signature_valid', 'ok'), r('geofence', s)];
    expect(score(two('flag'), withWeights({ signature_valid: 299, geofence: 201 }))).toEqual({
      verdict: 'Needs Review',
      score: 79.9,
      capReasons: [],
    });
    expect(score(two('flag'), withWeights({ signature_valid: 3, geofence: 2 }))).toEqual({
      verdict: 'Verified',
      score: 80,
      capReasons: [],
    });
  });

  it('boundaries via weights: 49.9 → Rejected, 50.0 → Needs Review', () => {
    // (499×0.5 + 1×0) / 500 = 49.9 ; (1×1 + 1×0) / 2 = 50.0
    const flagFail = [r('geofence', 'flag'), r('gps_accuracy', 'fail')];
    expect(score(flagFail, withWeights({ geofence: 499, gps_accuracy: 1 }))).toEqual({
      verdict: 'Rejected',
      score: 49.9,
      capReasons: ['anyFail'],
    });
    const okFail = [r('geofence', 'ok'), r('gps_accuracy', 'fail')];
    expect(score(okFail, withWeights({ geofence: 1, gps_accuracy: 1 }))).toEqual({
      verdict: 'Needs Review',
      score: 50,
      capReasons: ['anyFail'],
    });
    // all flags, no fail: exactly 50.0 and no cap → Needs Review (below verifiedMin)
    expect(score([r('geofence', 'flag'), r('gps_accuracy', 'flag')])).toEqual({ verdict: 'Needs Review', score: 50, capReasons: [] });
  });

  it('compares the unrounded mean and rounds only the reported score', () => {
    // (2996×1 + 2004×0.5) / 5000 = 79.96: reported as 80.0, but compared unrounded, so not Verified.
    const two = [r('signature_valid', 'ok'), r('geofence', 'flag')];
    const res = score(two, withWeights({ signature_valid: 2996, geofence: 2004 }));
    expect(res).toEqual({ verdict: 'Needs Review', score: 80, capReasons: [] });
    // and 49.96 reports 50.0 but is still Rejected: flag w=4996, fail w=4 → 2498/5000 = 49.96
    const low = score([r('geofence', 'flag'), r('gps_accuracy', 'fail')], withWeights({ geofence: 4996, gps_accuracy: 4 }));
    expect(low).toEqual({ verdict: 'Rejected', score: 50, capReasons: ['anyFail'] });
  });

  it('lists every cap that applied, in a stable order', () => {
    const all = twelve({
      yield_plausibility: 'flag',
      ndvi_harvest_window: 'unavailable',
      deforestation_overlap: 'flag',
      gps_accuracy: 'fail',
    });
    const expected = ['anyFail', 'flag:deforestation_overlap', 'flag:yield_plausibility', 'anyUnavailable'];
    expect(score(all).capReasons).toEqual(expected);
    expect(score([...all].reverse()).capReasons).toEqual(expected);
  });

  it('never Rejects when nothing could be scored', () => {
    expect(score([r('ndvi_cultivation', 'unavailable')])).toEqual({ verdict: 'Needs Review', score: 0, capReasons: ['anyUnavailable'] });
  });
});

describe('cfg-1 (TP2)', () => {
  it('holds the §6.2 values', () => {
    expect(CONFIG.version).toBe('cfg-1');
    expect(CONFIG.statusScore).toEqual({ ok: 1, flag: 0.5, fail: 0 });
    expect(Object.keys(CONFIG.weights)).toEqual([...CHECK_IDS]);
    expect(new Set(Object.values(CONFIG.weights))).toEqual(new Set([1]));
    expect(CONFIG.verdict).toEqual({ verifiedMin: 80, reviewMin: 50 });
    expect(CONFIG.caps).toEqual({ anyFail: true, flagCaps: ['deforestation_overlap', 'yield_plausibility'], anyUnavailable: true });
    expect(CONFIG.geofence).toEqual({ maxBufferM: 25 });
    expect(CONFIG.gpsAccuracy).toEqual({ okBelowM: 30, flagBelowM: 100 });
    expect(CONFIG.exifGps).toEqual({ maxDistanceM: 50 });
    expect(CONFIG.exifTime).toEqual({ maxExifClientMin: 10, exifFailAfterMin: 1440, maxClientServerMin: 1440, clientServerFailAfterMin: 10080 }); // EXE10
    expect(CONFIG.movement).toEqual({ maxKmh: 120 });
    expect(CONFIG.deforestation).toEqual({ flagAbovePct: 0, hardFailAtPct: 10, lossFromYear: 2021, canopyDensityPct: 10, gfwDatasetVersion: 'v1.13' });
    expect(CONFIG.ndviCultivation).toEqual({ minClearMonths: 6, canopyMin: 0.5, maxSeasonalSwing: 0.35 });
    expect(CONFIG.ndviHarvestWindow).toEqual({ windowDays: 30, okMin: 0.45, failBelow: 0.3 });
    expect(CONFIG.yield).toEqual({ flagAboveU: 1.5, hardFailAboveU: 2.0 });
    expect(CONFIG.providers).toEqual({ timeoutMs: 8000, remotePhaseCapMs: 10000 });
  });

  it('CONFIG_HASH is the SHA-256 of the RFC 8785 form of CONFIG', () => {
    const expected = createHash('sha256').update(canonicalize(CONFIG)!, 'utf8').digest('hex');
    expect(CONFIG_HASH).toBe(expected);
  });

  it('CONFIG_HASH is pinned: changing cfg-1 needs a TP/EV decision (EV13, CF-13)', () => {
    expect(CONFIG_HASH).toBe('c91ccb2c8295cfd1b7010964ee83f41e04085a0507674d149a21397b3b3655ac'); // EXE10 (was 3e513e84…, before the exifTime split)
  });
});

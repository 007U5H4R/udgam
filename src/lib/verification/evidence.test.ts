import { describe, expect, it } from 'vitest';
import { DEMO_DATA_SUFFIX, dur, evidence, istDate, kmh, kOfN, m, pct, sourced, xu } from './evidence';
import { CHECK_IDS } from './types';

// TC-011 (registry part): every row of technical-plan §6.5 renders, is snapshot-tested, and names the
// measured value (evaluation-plan §7.4 formats) and the threshold. The owner scores HR1 from the snapshot.

/** The dataset scorer lowercases and strips whitespace before a substring test (conventions.evidence_matching). */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
function expectContains(sentence: string, ...subs: string[]) {
  for (const s of subs) expect(norm(sentence), `${JSON.stringify(sentence)} ∌ ${s}`).toContain(norm(s));
}

const ALL = {
  'signature_valid.ok': evidence.signature_valid.ok({ deviceId: 'DV-7K2M9Q4D' }),
  'signature_valid.fail bad_signature': evidence.signature_valid.fail({ reason: 'bad_signature', deviceId: 'DV-7K2M9Q4D' }),
  'signature_valid.fail revoked': evidence.signature_valid.fail({ reason: 'revoked', deviceId: 'DV-7K2M9Q4D', revokedAt: '2026-09-30T20:00:00.000Z' }),
  'signature_valid.fail unknown_key': evidence.signature_valid.fail({ reason: 'unknown_key' }),
  'chain_continuity.ok': evidence.chain_continuity.ok({ seq: 7 }),
  'chain_continuity.flag out_of_order': evidence.chain_continuity.flag({
    reason: 'out_of_order',
    expected: 7,
    prevHash: '3f9a1c0b7e2d44aa' + '0'.repeat(48),
    seq: 9,
  }),
  'chain_continuity.flag new_device': evidence.chain_continuity.flag({ reason: 'new_device', priorEntries: 14 }),
  'photo_uniqueness.ok': evidence.photo_uniqueness.ok({ n: 3 }),
  'photo_uniqueness.fail': evidence.photo_uniqueness.fail({ k: 1, n: 3 }),
  'geofence.ok': evidence.geofence.ok({ distanceM: 41.6 }),
  'geofence.flag': evidence.geofence.flag({ distanceM: 12, bufferM: 20 }),
  'geofence.fail': evidence.geofence.fail({ distanceM: 2400, bufferM: 25 }),
  'gps_accuracy.ok': evidence.gps_accuracy.ok({ accuracyM: 8 }),
  'gps_accuracy.flag': evidence.gps_accuracy.flag({ accuracyM: 60 }),
  'gps_accuracy.fail': evidence.gps_accuracy.fail({ accuracyM: 150 }),
  'exif_gps_agreement.ok': evidence.exif_gps_agreement.ok({ distanceM: 10 }),
  'exif_gps_agreement.flag': evidence.exif_gps_agreement.flag(),
  'exif_gps_agreement.fail': evidence.exif_gps_agreement.fail({ distanceM: 3200 }),
  'exif_time_agreement.ok': evidence.exif_time_agreement.ok({ exifClientMin: 2, clientServerMin: 0.4 }),
  'exif_time_agreement.flag gap': evidence.exif_time_agreement.flag({ exifClientMin: 185, clientServerMin: 1 }),
  'exif_time_agreement.flag no exif': evidence.exif_time_agreement.flag({ exifClientMin: null, clientServerMin: 3 }),
  'exif_time_agreement.fail': evidence.exif_time_agreement.fail({ exifClientMin: 2, clientServerMin: 12960 }),
  'exif_time_agreement.fail exif': evidence.exif_time_agreement.fail({ exifClientMin: 4320, clientServerMin: 1 }), // EXE10
  'movement_plausibility.ok first': evidence.movement_plausibility.ok({ first: true }),
  'movement_plausibility.ok': evidence.movement_plausibility.ok({ speedKmh: 0.13, distanceM: 100, minutes: 45 }),
  'movement_plausibility.fail': evidence.movement_plausibility.fail({ speedKmh: 337.5, distanceM: 45000, minutes: 8 }),
  'movement_plausibility.fail clock': evidence.movement_plausibility.fail({ timeDidNotAdvance: true, distanceM: 100, minutes: -5 }),
  'deforestation_overlap.ok': evidence.deforestation_overlap.ok({ lossPct: 0 }),
  'deforestation_overlap.flag': evidence.deforestation_overlap.flag({ lossPct: 9.5 }),
  'deforestation_overlap.fail': evidence.deforestation_overlap.fail({ lossPct: 25 }),
  'deforestation_overlap.unavailable': evidence.deforestation_overlap.unavailable({ reason: 'timeout' }),
  'ndvi_cultivation.ok': evidence.ndvi_cultivation.ok({ min: 0.62, max: 0.81, clearMonths: 11 }),
  'ndvi_cultivation.fail low': evidence.ndvi_cultivation.fail({ min: 0.21, max: 0.66, clearMonths: 10 }),
  'ndvi_cultivation.fail swing': evidence.ndvi_cultivation.fail({ min: 0.52, max: 0.9, clearMonths: 10 }),
  'ndvi_cultivation.unavailable few months': evidence.ndvi_cultivation.unavailable({ reason: 'few_clear_months', clearMonths: 4 }),
  'ndvi_cultivation.unavailable provider': evidence.ndvi_cultivation.unavailable({ reason: 'provider', detail: 'http_500' }),
  'ndvi_harvest_window.ok': evidence.ndvi_harvest_window.ok({ ndvi: 0.71 }),
  'ndvi_harvest_window.flag': evidence.ndvi_harvest_window.flag({ ndvi: 0.38 }),
  'ndvi_harvest_window.fail': evidence.ndvi_harvest_window.fail({ ndvi: 0.22 }),
  'ndvi_harvest_window.unavailable cloud': evidence.ndvi_harvest_window.unavailable({ reason: 'cloud' }),
  'ndvi_harvest_window.unavailable provider': evidence.ndvi_harvest_window.unavailable({ reason: 'provider', detail: 'timeout' }),
  'yield_plausibility.ok': evidence.yield_plausibility.ok({ ratio: 0.3 }),
  'yield_plausibility.flag': evidence.yield_plausibility.flag({ ratio: 1.75 }),
  'yield_plausibility.fail': evidence.yield_plausibility.fail({ ratio: 2.5 }),
  'yield_plausibility.unavailable': evidence.yield_plausibility.unavailable({ crop: 'robusta' }),
  'any.unavailable threw': evidence.threw('TypeError'),
  // CF-11 / EXE12: a sentence derived from fixture remote-sensing data carries the demo-data suffix.
  'deforestation_overlap.ok fixture source': sourced({ evidence: evidence.deforestation_overlap.ok({ lossPct: 0 }) }, 'fixture').evidence,
};

describe('evidence templates (TC-011)', () => {
  it('render every §6.5 row (snapshot)', () => {
    expect(ALL).toMatchSnapshot();
  });

  it('cover every check id', () => {
    for (const id of CHECK_IDS) expect(evidence[id], id).toBeDefined();
  });

  it('carry the dataset evidence substrings', () => {
    expectContains(evidence.geofence.fail({ distanceM: 2400, bufferM: 25 }), '2400 m'); // EVAL-022
    expectContains(evidence.geofence.flag({ distanceM: 12, bufferM: 20 }), '12 m', '20 m'); // EVAL-009
    expectContains(evidence.geofence.fail({ distanceM: 30, bufferM: 8 }), '30 m', '8 m'); // EVAL-025
    expectContains(evidence.geofence.fail({ distanceM: 26, bufferM: 25 }), '26 m', '25 m'); // EVAL-027
    expectContains(evidence.gps_accuracy.fail({ accuracyM: 150 }), '150 m'); // EVAL-020
    expectContains(evidence.exif_gps_agreement.fail({ distanceM: 3200 }), '3200 m'); // EVAL-023
    expectContains(evidence.movement_plausibility.fail({ speedKmh: 337.5, distanceM: 45000, minutes: 8 }), '338 km/h'); // EVAL-024
    expectContains(evidence.movement_plausibility.fail({ speedKmh: 150, distanceM: 25000, minutes: 10 }), '150 km/h'); // EVAL-028
    expectContains(evidence.deforestation_overlap.ok({ lossPct: 0 }), '0.0%'); // EVAL-006
    expectContains(evidence.deforestation_overlap.flag({ lossPct: 3 }), '3.0%'); // EVAL-019, 040
    expectContains(evidence.deforestation_overlap.fail({ lossPct: 25 }), '25.0%', '10.0%'); // EVAL-037
    expectContains(evidence.deforestation_overlap.fail({ lossPct: 10.5 }), '10.5%'); // EVAL-038
    expectContains(evidence.deforestation_overlap.flag({ lossPct: 9.5 }), '9.5%'); // EVAL-039
    expectContains(evidence.yield_plausibility.fail({ ratio: 2.5 }), '2.50x'); // EVAL-045
    expectContains(evidence.photo_uniqueness.fail({ k: 1, n: 3 }), '1 of 3'); // EVAL-032
    expectContains(evidence.threw('TypeError'), 'TypeError'); // EVAL-018
  });

  it('name the threshold wherever one applies', () => {
    expectContains(ALL['geofence.fail'], 'allowance 25 m');
    expectContains(ALL['gps_accuracy.ok'], '30 m', '100 m');
    expectContains(ALL['exif_gps_agreement.ok'], 'limit 50 m');
    expectContains(ALL['exif_time_agreement.ok'], 'limit 10 min', 'limit 24 h');
    expectContains(ALL['exif_time_agreement.fail'], 'fail over 7 days');
    expectContains(ALL['exif_time_agreement.fail exif'], '3 days', 'fail over 24 h'); // EXE10: the limit actually crossed
    expect(ALL['exif_time_agreement.fail exif']).not.toContain('7 days');
    expectContains(ALL['movement_plausibility.fail'], 'limit 120 km/h');
    expectContains(ALL['deforestation_overlap.ok'], '10.0%');
    expectContains(ALL['ndvi_cultivation.ok'], '0.50', '0.35');
    expectContains(ALL['ndvi_harvest_window.flag'], '0.45');
    expectContains(ALL['yield_plausibility.ok'], '1.50x', '2.00x');
  });

  it('name the device and the revocation date in IST', () => {
    expect(ALL['signature_valid.fail revoked']).toBe('Phone DV-7K2M9Q4D was revoked on 2026-10-01');
    expect(ALL['chain_continuity.flag out_of_order']).toBe('Expected entry 7 after 3f9a1c0b, got entry 9');
  });
});

describe('demo data (CF-11, EXE12)', () => {
  it('a fixture-sourced sentence ends with the literal " (demo data)"; a live one is unchanged', () => {
    expect(DEMO_DATA_SUFFIX).toBe(' (demo data)');
    const o = { id: 'deforestation_overlap', evidence: '0.0% of plot area lost since 2021 (hard fail at 10.0%)' };
    expect(sourced(o, 'fixture')).toEqual({ id: 'deforestation_overlap', evidence: '0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)' });
    expect(sourced(o, 'live')).toEqual(o);
  });
});

describe('a shown value never sits on the wrong side of its threshold (spec minor, TC-011)', () => {
  it.each([
    ['flag', 9.94, '9.9% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['flag', 9.96, '9.9% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['flag', 9.9999, '9.9% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['fail', 10, '10.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['fail', 10.04, '10.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['flag', 0.04, '0.1% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['flag', 0.0001, '0.1% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['ok', 0, '0.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    ['fail', 140, '140.0% of plot area lost since 2021 (hard fail at 10.0%)'],
  ] as const)('forest loss %s %s → %s', (status, lossPct, sentence) => {
    expect(evidence.deforestation_overlap[status]({ lossPct })).toBe(sentence);
  });

  it.each([
    ['ok', 0.45, 'NDVI 0.45 (needs ≥ 0.45)'],
    ['flag', 0.449, 'NDVI 0.44 (needs ≥ 0.45)'],
    ['flag', 0.4499, 'NDVI 0.44 (needs ≥ 0.45)'],
    ['flag', 0.3, 'NDVI 0.30 (needs ≥ 0.45)'],
    ['fail', 0.2999, 'NDVI 0.29 (needs ≥ 0.45, fail below 0.30)'],
    ['fail', 0.296, 'NDVI 0.29 (needs ≥ 0.45, fail below 0.30)'],
  ] as const)('harvest window %s %s → …%s', (status, ndvi, tail) => {
    expect(evidence.ndvi_harvest_window[status]({ ndvi })).toBe(`Living canopy around the picking date: ${tail}`);
  });

  it('cultivation: a failing lowest month reads below 0.50 and a failing swing above 0.35', () => {
    expect(evidence.ndvi_cultivation.fail({ min: 0.4996, max: 0.8, clearMonths: 8 })).toBe(
      'No year-round canopy over 8 clear months: lowest month NDVI 0.49 (needs ≥ 0.50)',
    );
    expect(evidence.ndvi_cultivation.fail({ min: 0.5, max: 0.8504, clearMonths: 8 })).toBe(
      'No year-round canopy over 8 clear months: seasonal swing 0.36 (limit 0.35)',
    );
    // exactly on the limits is ok, and the shown range stays within the swing limit
    expect(evidence.ndvi_cultivation.ok({ min: 0.5, max: 0.85, clearMonths: 6 })).toBe(
      'Canopy all year: monthly NDVI 0.50–0.85 over 6 clear months (needs ≥ 0.50, swing ≤ 0.35)',
    );
    expect(evidence.ndvi_cultivation.ok({ min: 0.5049, max: 0.8549, clearMonths: 6 })).toBe(
      'Canopy all year: monthly NDVI 0.50–0.85 over 6 clear months (needs ≥ 0.50, swing ≤ 0.35)',
    );
  });

  it.each([
    ['ok', 1.5, '1.50x'],
    ['ok', 1.4999, '1.50x'],
    ['flag', 1.5001, '1.51x'],
    ['flag', 1.504, '1.51x'],
    ['flag', 2, '2.00x'],
    ['fail', 2.0001, '2.01x'],
    ['fail', 2.004, '2.01x'],
    ['fail', 2.5, '2.50x'],
  ] as const)('yield ×U %s %s → %s', (status, ratio, shown) => {
    expect(evidence.yield_plausibility[status]({ ratio })).toBe(`Season total ${shown} the reference upper bound (flag above 1.50x, hard fail above 2.00x)`);
  });
});

describe('formatters (evaluation-plan §7.4)', () => {
  it('m: whole metres', () => {
    expect(m(182.4)).toBe('182 m');
    expect(m(182.5)).toBe('183 m');
    expect(m(2400)).toBe('2400 m');
    expect(m(-0)).toBe('0 m');
  });
  it('kmh: whole km/h', () => {
    expect(kmh(337.5)).toBe('338 km/h');
    expect(kmh(0.13)).toBe('0 km/h');
  });
  it('pct: one decimal', () => {
    expect(pct(9.5)).toBe('9.5%');
    expect(pct(0)).toBe('0.0%');
    expect(pct(25)).toBe('25.0%');
    expect(pct(3.04)).toBe('3.0%');
  });
  it('xu: two decimals', () => {
    expect(xu(2.05)).toBe('2.05x');
    expect(xu(2.5)).toBe('2.50x');
    expect(xu(1.5)).toBe('1.50x');
  });
  it('kOfN', () => {
    expect(kOfN(1, 3)).toBe('1 of 3');
  });
  it('dur: N min under 120 min, N h under 48 h, else N days', () => {
    expect(dur(0.4)).toBe('0 min');
    expect(dur(119)).toBe('119 min');
    expect(dur(120)).toBe('2 h');
    expect(dur(-185)).toBe('3 h');
    expect(dur(1440)).toBe('24 h');
    expect(dur(2819)).toBe('47 h');
    expect(dur(2879)).toBe('2 days');
    expect(dur(10080)).toBe('7 days');
  });
  it('istDate: the calendar date in IST (UTC+05:30), independent of the host zone', () => {
    expect(istDate('2026-09-30T18:29:59.999Z')).toBe('2026-09-30');
    expect(istDate('2026-09-30T18:30:00.000Z')).toBe('2026-10-01');
  });
});

import { describe, expect, it } from 'vitest';
import { evidence } from '../verification/evidence';
import type { CheckId, CheckResult, CheckStatus, Verdict, VerifyResult } from '../verification/types';
import { farmerLines, refusalCopy } from './farmer-evidence';

// TSK-10.1: the farmer copy layer. The verifier's evidence sentences are rewritten in plain words for
// the verdict screens (Design.md §19); every number is passed through from the evidence, never
// recomputed. At most three lines.

const check = (id: CheckId, status: CheckStatus, ev: string, hardFail = false): CheckResult => ({
  id,
  status,
  score: status === 'ok' ? 1 : status === 'flag' ? 0.5 : 0,
  weight: 1,
  hardFail,
  evidence: ev,
});

const result = (verdict: Verdict, checks: CheckResult[], capReasons: string[] = []): VerifyResult => ({
  verdict,
  score: 90,
  checks,
  unavailableProviders: [],
  capReasons,
  config: { version: 'cfg-1', hash: '0'.repeat(64) },
});

const clean: CheckResult[] = [
  check('signature_valid', 'ok', evidence.signature_valid.ok({ deviceId: 'DV-ABCDEFGH' })),
  check('photo_uniqueness', 'ok', evidence.photo_uniqueness.ok({ n: 3 })),
  check('geofence', 'ok', evidence.geofence.ok({ distanceM: 14 })),
  check('gps_accuracy', 'ok', evidence.gps_accuracy.ok({ accuracyM: 8 })),
  check('exif_gps_agreement', 'ok', evidence.exif_gps_agreement.ok({ distanceM: 6 })),
  check('exif_time_agreement', 'ok', evidence.exif_time_agreement.ok({ exifClientMin: 2, clientServerMin: 0 })),
  check('movement_plausibility', 'ok', evidence.movement_plausibility.ok({ first: true })),
  check('deforestation_overlap', 'ok', evidence.deforestation_overlap.ok({ lossPct: 0 })),
];

const FORBIDDEN = /fraud|fake|cheat|rejected/i;
const all = (lines: { text: string }[]) => lines.map((l) => l.text).join(' ');

describe('farmerLines', () => {
  it('Verified: where, the photos and the forest map, in plain words with the evidence numbers', () => {
    const lines = farmerLines(result('Verified', clean), 'en', { plot: 'Plot 2' });
    expect(lines).toEqual([
      { icon: 'location', text: 'You were 14 m inside Plot 2' },
      { icon: 'camera', text: '3 new photos, taken today' },
      { icon: 'tree', text: 'Forest map: no trees cleared since 2021' },
    ]);
  });

  it('Verified without a forest check yet: falls back to the phone seal (still three lines at most)', () => {
    const lines = farmerLines(result('Verified', clean.filter((c) => c.id !== 'deforestation_overlap')), 'en', { plot: 'Plot 2' });
    expect(lines).toHaveLength(3);
    expect(lines[2]!.icon).toBe('seal');
  });

  it('a geofence fail of 30 m puts 30 m in the first line', () => {
    const r = result(
      'Needs Review',
      [...clean.filter((c) => c.id !== 'geofence'), check('geofence', 'fail', evidence.geofence.fail({ distanceM: 30, bufferM: 8 }))],
      ['anyFail'],
    );
    const lines = farmerLines(r, 'en', { plot: 'Plot 2' });
    expect(lines[0]!.text).toContain('30 m');
    expect(lines[0]!.icon).toBe('location');
  });

  it('an exif_time_agreement fail names the gap that crossed its limit (EXE10)', () => {
    const timeFail = (exifClientMin: number, clientServerMin: number) =>
      farmerLines(
        result('Needs Review', [check('exif_time_agreement', 'fail', evidence.exif_time_agreement.fail({ exifClientMin, clientServerMin }))], ['anyFail']),
        'en',
      )[0]!.text;
    // The photo is 3 days old while the clock is 23 h off (a flag): the photo is the reason.
    expect(timeFail(4320, 1380)).toBe('The photo was taken 3 days before or after this picking.');
    // The clock is 9 days off while the photo matches it.
    expect(timeFail(2, 12_960)).toBe("This phone's clock is 9 days off.");
  });

  it('ndvi_harvest_window unavailable (cloud): names the cloudy satellite picture and asks nothing of the farmer', () => {
    const r = result(
      'Needs Review',
      [...clean, check('ndvi_harvest_window', 'unavailable', evidence.ndvi_harvest_window.unavailable({ reason: 'cloud' }))],
      ['anyUnavailable'],
    );
    const lines = farmerLines(r, 'en');
    expect(lines[0]).toEqual({ icon: 'cloud', text: 'The satellite picture for this month was cloudy.' });
    expect(all(lines)).toContain("You don't need to do anything.");
    expect(all(lines)).toContain('The office will look at this.');
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('Rejected (photo seen before): names the reason and what to do', () => {
    const r = result('Rejected', [...clean.filter((c) => c.id !== 'photo_uniqueness'), check('photo_uniqueness', 'fail', evidence.photo_uniqueness.fail({ k: 1, n: 2 }), true)], ['anyFail']);
    const lines = farmerLines(r, 'en');
    expect(lines[0]).toEqual({ icon: 'camera', text: '1 of 2 photos were used before.' });
    expect(lines[1]!.text).toBe("Take new photos of today's picking and record it again.");
  });

  it('never says fraud, fake, cheat or Rejected, in any verdict and any language', () => {
    const variants: VerifyResult[] = [
      result('Verified', clean),
      result('Needs Review', [...clean, check('gps_accuracy', 'fail', evidence.gps_accuracy.fail({ accuracyM: 150 }))], ['anyFail']),
      result('Rejected', [check('signature_valid', 'fail', evidence.signature_valid.fail({ reason: 'bad_signature', deviceId: 'DV-ABCDEFGH' }), true)], ['anyFail']),
      result('Rejected', [check('deforestation_overlap', 'fail', evidence.deforestation_overlap.fail({ lossPct: 18 }), true)], ['anyFail']),
      result('Rejected', [check('movement_plausibility', 'fail', evidence.movement_plausibility.fail({ speedKmh: 338, distanceM: 90000, minutes: 16 }))]),
    ];
    for (const lang of ['en', 'kn'] as const) {
      for (const v of variants) {
        const lines = farmerLines(v, lang, { plot: 'Plot 2' });
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.length).toBeLessThanOrEqual(3);
        expect(all(lines)).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('passes numbers through unchanged (the evidence says 18.0%, the farmer line says 18.0%)', () => {
    const r = result('Rejected', [check('deforestation_overlap', 'fail', evidence.deforestation_overlap.fail({ lossPct: 18 }), true)], ['anyFail']);
    expect(farmerLines(r, 'en')[0]!.text).toContain('18.0%');
    expect(farmerLines(r, 'kn')[0]!.text).toContain('18.0%');
  });
});

describe('refusalCopy', () => {
  it('gives each boundary refusal what happened and what to do, with no accusation words', () => {
    for (const reason of [
      'plot_not_assigned',
      'device_revoked',
      'unknown_device',
      'device_not_owned',
      'bad_signature',
      'media_hash_mismatch',
      'media_count',
      'media_too_large',
      'media_type',
      'length_required',
      'body_too_large',
      'bad_schema',
      'non_canonical',
      'bad_form',
      'rate_limited',
      'something_new',
    ]) {
      const c = refusalCopy(reason, 'en', { retryAfterSec: 120 });
      expect(c.happened.length, reason).toBeGreaterThan(0);
      expect(c.todo.length, reason).toBeGreaterThan(0);
      expect(`${c.happened} ${c.todo}`, reason).not.toMatch(FORBIDDEN);
      expect(refusalCopy(reason, 'kn', { retryAfterSec: 120 }).happened.length).toBeGreaterThan(0);
    }
  });

  it('rate_limited says how long to wait, in whole minutes, and that nothing is lost', () => {
    const c = refusalCopy('rate_limited', 'en', { retryAfterSec: 90 });
    expect(`${c.happened} ${c.todo}`).toContain('2 minutes');
    expect(c.nothingLost).toBe(true);
  });

  it('keeps the existing plot_not_assigned copy', () => {
    expect(`${refusalCopy('plot_not_assigned', 'en').happened} ${refusalCopy('plot_not_assigned', 'en').todo}`).toBe(
      'This plot is not assigned to you. Ask the office to assign it to you, then record the picking again.',
    );
  });
});

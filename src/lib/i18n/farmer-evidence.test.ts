import { describe, expect, it } from 'vitest';
import { DEMO_DATA_SUFFIX, evidence, sourced } from '../verification/evidence';
import type { CheckId, CheckResult, CheckStatus, Verdict, VerifyResult } from '../verification/types';
import { en } from './en';
import { farmerLines, FIXTURE_MARK, refusalCopy, refusalKeepsOutbox, retryWait } from './farmer-evidence';
import { kn } from './kn';

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
      { icon: 'location', text: 'You were 14\u00a0m inside Plot 2' }, // a number and its unit never wrap apart
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
    expect(lines[0]!.text).toContain('30\u00a0m');
    expect(lines[0]!.icon).toBe('location');
  });

  it('an exif_time_agreement fail names the gap that crossed its limit (EXE10)', () => {
    const timeFail = (exifClientMin: number, clientServerMin: number) =>
      farmerLines(
        result('Needs Review', [check('exif_time_agreement', 'fail', evidence.exif_time_agreement.fail({ exifClientMin, clientServerMin }))], ['anyFail']),
        'en',
      )[0]!.text;
    // The photo is 3 days old while the clock is 23 h off (a flag): the photo is the reason.
    expect(timeFail(4320, 1380)).toBe('The photo was taken 3\u00a0days before or after this picking.');
    // The clock is 9 days off while the photo matches it.
    expect(timeFail(2, 12_960)).toBe("This phone's clock is 9\u00a0days off.");
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

  it('keeps every number with its unit on one line: metres, minutes and durations (QA-P5-8)', () => {
    const move = result('Rejected', [check('movement_plausibility', 'fail', evidence.movement_plausibility.fail({ speedKmh: 338, distanceM: 90000, minutes: 16 }))]);
    expect(farmerLines(move, 'en')[0]!.text).toBe('This picking is 90000\u00a0m from your last one, only 16\u00a0min later.');
    expect(farmerLines(move, 'kn')[0]!.text).toContain('16\u00a0ನಿಮಿಷ');
    const late = result('Needs Review', [check('exif_time_agreement', 'fail', evidence.exif_time_agreement.fail({ exifClientMin: 1441, clientServerMin: 0 }))], ['anyFail']);
    expect(farmerLines(late, 'en')[0]!.text).toBe('The photo was taken 24\u00a0h\u00a01\u00a0min before or after this picking.');
  });

  it('passes numbers through unchanged (the evidence says 18.0%, the farmer line says 18.0%)', () => {
    const r = result('Rejected', [check('deforestation_overlap', 'fail', evidence.deforestation_overlap.fail({ lossPct: 18 }), true)], ['anyFail']);
    expect(farmerLines(r, 'en')[0]!.text).toContain('18.0%');
    expect(farmerLines(r, 'kn')[0]!.text).toContain('18.0%');
  });
});

describe('farmerLines: demo data (owner decision EXE12)', () => {
  // Every evidence sentence derived from fixture remote-sensing data ends with "(demo data)"; the
  // farmer's plain-words line keeps that label, after the sentence's own full stop.
  const fixture = (c: CheckResult) => ({ ...c, evidence: sourced({ evidence: c.evidence }, 'fixture').evidence });
  const base = clean.filter((c) => c.id !== 'deforestation_overlap');
  const forestOk = check('deforestation_overlap', 'ok', evidence.deforestation_overlap.ok({ lossPct: 0 }));
  const canopyOk = check('ndvi_cultivation', 'ok', evidence.ndvi_cultivation.ok({ min: 0.62, max: 0.78, clearMonths: 10 }));
  const satOk = check('ndvi_harvest_window', 'ok', evidence.ndvi_harvest_window.ok({ ndvi: 0.66 }));
  const needs = (c: CheckResult, cap: string) => farmerLines(result('Needs Review', [...clean.filter((x) => x.id !== c.id), c], [cap]), 'en')[0]!;

  it('Verified positives from fixture data: forest, canopy and satellite lines each end with "(demo data)"', () => {
    const lines = farmerLines(result('Verified', [check('signature_valid', 'ok', 'Signed'), fixture(forestOk), fixture(canopyOk), fixture(satOk)]), 'en');
    expect(lines).toEqual([
      { icon: 'tree', text: 'Forest map: no trees cleared since 2021 (demo\u00a0data)' },
      { icon: 'tree', text: 'Satellite: trees on the plot all year (demo\u00a0data)' },
      { icon: 'cloud', text: 'Satellite: green trees this month (demo\u00a0data)' },
    ]);
    const all3 = farmerLines(result('Verified', [...base, fixture(forestOk)]), 'en', { plot: 'Plot 2' });
    expect(all3[2]).toEqual({ icon: 'tree', text: 'Forest map: no trees cleared since 2021 (demo\u00a0data)' });
  });

  it('the same positives from live data carry no label', () => {
    const lines = farmerLines(result('Verified', [check('signature_valid', 'ok', 'Signed'), forestOk, canopyOk, satOk]), 'en');
    expect(lines.map((l) => l.text)).toEqual(['Forest map: no trees cleared since 2021', 'Satellite: trees on the plot all year', 'Satellite: green trees this month']);
  });

  it('findings from fixture data: forest loss, no canopy, too few clear months, cloudy, little green', () => {
    expect(needs(fixture(check('deforestation_overlap', 'flag', evidence.deforestation_overlap.flag({ lossPct: 6 }))), 'flag:deforestation_overlap')).toEqual({
      icon: 'tree',
      text: 'Forest map: 6.0% of the plot cleared since 2021. (demo\u00a0data)',
    });
    expect(needs(fixture(check('ndvi_cultivation', 'fail', evidence.ndvi_cultivation.fail({ min: 0.2, max: 0.5, clearMonths: 10 }))), 'anyFail').text).toBe(
      'The satellite does not see trees on the plot all year. (demo\u00a0data)',
    );
    expect(needs(fixture(check('ndvi_cultivation', 'unavailable', evidence.ndvi_cultivation.unavailable({ reason: 'few_clear_months', clearMonths: 3 }))), 'anyUnavailable').text).toBe(
      'There are not enough clear satellite pictures of this plot yet. (demo\u00a0data)',
    );
    expect(needs(fixture(check('ndvi_harvest_window', 'unavailable', evidence.ndvi_harvest_window.unavailable({ reason: 'cloud' }))), 'anyUnavailable').text).toBe(
      'The satellite picture for this month was cloudy. (demo\u00a0data)',
    );
    expect(needs(fixture(check('ndvi_harvest_window', 'flag', evidence.ndvi_harvest_window.flag({ ndvi: 0.38 }))), 'flag:ndvi_harvest_window').text).toBe(
      'The satellite sees little green on the plot this month (NDVI 0.38). (demo\u00a0data)',
    );
    const rejected = farmerLines(result('Rejected', [fixture(check('deforestation_overlap', 'fail', evidence.deforestation_overlap.fail({ lossPct: 18 }), true))], ['anyFail']), 'en');
    expect(rejected[0]).toEqual({ icon: 'tree', text: 'Forest map: 18.0% of the plot cleared since 2021. (demo\u00a0data)' });
  });

  it('a capped-flag reason never turns an ok check of the same id into a finding', () => {
    const checks = [...clean.filter((c) => c.id !== 'gps_accuracy'), check('gps_accuracy', 'flag', evidence.gps_accuracy.flag({ accuracyM: 60 }))];
    const r = result('Needs Review', checks, ['flag:deforestation_overlap']); // deforestation_overlap is ok here
    expect(farmerLines(r, 'en').map((l) => l.text)).toEqual([
      'The GPS signal was weak (60\u00a0m).',
      "The office will look at this. You don't need to do anything.",
    ]);
  });

  it('a live finding has no label, and a provider failure (no data derived) never has one', () => {
    expect(needs(check('ndvi_harvest_window', 'unavailable', evidence.ndvi_harvest_window.unavailable({ reason: 'cloud' })), 'anyUnavailable').text).toBe(
      'The satellite picture for this month was cloudy.',
    );
    expect(needs(check('deforestation_overlap', 'unavailable', evidence.deforestation_overlap.unavailable({ reason: 'GFW timeout' })), 'anyUnavailable').text).toBe(
      'The forest map did not answer. The office will try again.',
    );
    expect(needs(check('ndvi_harvest_window', 'unavailable', evidence.ndvi_harvest_window.unavailable({ reason: 'provider', detail: 'timeout' })), 'anyUnavailable').text).toBe(
      'The satellite did not answer. The office will try again.',
    );
  });

  it('Kannada lines carry the Kannada label', () => {
    const [line] = farmerLines(result('Verified', [fixture(forestOk)]), 'kn');
    expect(line!.text).toBe(`${kn['fe.forest.none']!.replace('{year}', '2021')}${kn['fe.demo']}`);
    expect(kn['fe.demo']).not.toBe(en['fe.demo']);
    expect(en['fe.demo']).toBe(' (demo\u00a0data)'); // never wraps inside itself (QA-P5-8)
    expect(kn['fe.demo']).toBe(' (ಡೆಮೊ\u00a0ಡೇಟಾ)');
    expect(en['fe.demo']).toBe(DEMO_DATA_SUFFIX.replace(' data', '\u00a0data'));
    expect(FIXTURE_MARK).toBe(DEMO_DATA_SUFFIX);
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

  it('TKT-11: forbidden, device_not_owned and length_required keep the picking and say to sign in again or try again', () => {
    expect(refusalCopy('forbidden', 'en')).toEqual({
      happened: 'You are signed in with an account that cannot send pickings.',
      todo: 'Sign in with your field account, then try again.',
      nothingLost: true,
    });
    expect(refusalCopy('device_not_owned', 'en')).toEqual({
      happened: 'This phone is set up for another person.',
      todo: 'Sign in with your own account, then try again. Or ask the office to set up this phone for you.',
      nothingLost: true,
    });
    expect(refusalCopy('length_required', 'en')).toEqual({
      happened: 'The picking could not be sent in one piece.',
      todo: 'Try again. If it happens again, tell the office.',
      nothingLost: true,
    });
    for (const r of ['forbidden', 'device_not_owned', 'length_required', 'rate_limited', 'unauthenticated']) expect(refusalKeepsOutbox(r), r).toBe(true);
    for (const r of ['plot_not_assigned', 'device_revoked', 'unknown_device', 'bad_signature', 'media_hash_mismatch']) expect(refusalKeepsOutbox(r), r).toBe(false);
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

describe('retryWait (the saved screen after a 429 or a busy 503 with Retry-After)', () => {
  it('says how long to wait in plain words: seconds under a minute, else whole minutes rounded up', () => {
    expect(retryWait(1, 'en')).toBe('You can try again in 1 second.');
    expect(retryWait(5, 'en')).toBe('You can try again in 5 seconds.');
    expect(retryWait(60, 'en')).toBe('You can try again in 1 minute.');
    expect(retryWait(61, 'en')).toBe('You can try again in 2 minutes.');
    expect(retryWait(3600, 'en')).toBe('You can try again in 60 minutes.');
  });

  it('has Kannada copy with the number in it', () => {
    expect(retryWait(5, 'kn')).toBe(kn['rec.saved.waitSec']!.replace('{sec}', '5'));
    expect(retryWait(120, 'kn')).toBe(kn['rec.saved.waitMin']!.replace('{min}', '2'));
    expect(retryWait(120, 'kn')).not.toBe(retryWait(120, 'en'));
  });
});

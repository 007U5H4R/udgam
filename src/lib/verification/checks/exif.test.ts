import { beforeAll, describe, expect, it } from 'vitest';
import { CENTRE, makeContext, makeDevice, makeSubmission, type TestDevice } from '../../../../tests/helpers/verify';
import { haversineM } from '../../geo/distance';
import type { LatLng } from '../../geo/types';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import type { CheckId, ExifFacts, Submission } from '../types';
import { runCheck } from '../verify';

// TC-036 (EXIF GPS part) and TC-037 (time part), technical-plan §22 TSK-08.4, §6.3 and TP4 (GAP-1).
// Every threshold pair from the dataset lands on its expected side: EVAL-014/023 (EXIF GPS),
// EVAL-011/056, 122/123, 034/033 (EXIF–client; worst photo, fail over 24 h per EXE10) and
// EVAL-055/057/035 (client–server; fail over 7 days).

let dev: TestDevice;
beforeAll(async () => {
  dev = await makeDevice();
});

const check = (id: CheckId): Check => {
  const c = REGISTRY.find((x) => x.id === id);
  if (!c) throw new Error(`${id} is not in the registry`);
  return c;
};

const PHONE = { ...CENTRE, accuracyM: 8 };
const M_PER_DEG = 111_195.08;

/** A point due north of `from` whose haversine distance is `m` metres (never a hair over). */
function north(from: LatLng, m: number): LatLng {
  let p = { lat: from.lat + m / M_PER_DEG, lng: from.lng };
  while (haversineM(from, p) > m) p = { lat: p.lat - 1e-12, lng: p.lng };
  return p;
}

const CAPTURED_AT = '2026-12-08T05:30:00.000Z';
const minutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

/** A submission whose photos carry `exifs`, captured at `capturedAt` and received at `serverReceivedAt`. */
async function sub(exifs: ExifFacts[], times: { capturedAt?: string; serverReceivedAt?: string } = {}): Promise<Submission> {
  const hashes = exifs.map((_, i) => String(i + 1).padStart(2, '0').repeat(32));
  const s = await makeSubmission({ device: dev, gps: PHONE, mediaHashes: hashes, capturedAt: times.capturedAt ?? CAPTURED_AT });
  return { ...s, media: s.media.map((m, i) => ({ ...m, exif: exifs[i]! })), serverReceivedAt: times.serverReceivedAt ?? times.capturedAt ?? CAPTURED_AT };
}
const run = async (id: CheckId, s: Submission) => runCheck(check(id), s, makeContext(dev), CONFIG);

describe('exif_gps_agreement (TC-036; EVAL-007, 014, 023)', () => {
  const at = (m: number): ExifFacts => ({ gps: north(PHONE, m), takenAt: CAPTURED_AT });
  const noGps: ExifFacts = { gps: null, takenAt: CAPTURED_AT };

  it.each([
    [10, 'ok'],
    [35, 'ok'], // EVAL-014
    [49, 'ok'],
    [50, 'ok'],
    [51, 'fail'],
  ] as const)('EXIF GPS %d m from the phone → %s', async (m, status) => {
    const r = await run('exif_gps_agreement', await sub([at(m)]));
    expect(r).toMatchObject({ status, hardFail: false, evidence: `Photo location ${m} m from phone location (limit 50 m)` });
  });

  it('EVAL-023: 3200 m → fail "3200 m"', async () => {
    const r = await run('exif_gps_agreement', await sub([at(3200), at(3200)]));
    expect(r).toMatchObject({ status: 'fail', evidence: 'Photo location 3200 m from phone location (limit 50 m)' });
  });

  it('the worst photo decides', async () => {
    const r = await run('exif_gps_agreement', await sub([at(10), at(51), at(20)]));
    expect(r).toMatchObject({ status: 'fail', evidence: 'Photo location 51 m from phone location (limit 50 m)' });
  });

  it('photos without GPS are ignored while another photo has it', async () => {
    expect(await run('exif_gps_agreement', await sub([noGps, at(12)]))).toMatchObject({ status: 'ok', evidence: 'Photo location 12 m from phone location (limit 50 m)' });
    expect((await run('exif_gps_agreement', await sub([at(60), noGps]))).status).toBe('fail');
  });

  it('EVAL-007: GPS absent on every photo → flag "Photo has no location data", never a fail', async () => {
    expect(await run('exif_gps_agreement', await sub([noGps, noGps]))).toMatchObject({ status: 'flag', hardFail: false, evidence: 'Photo has no location data' });
  });
});

describe('exif_time_agreement (TC-037; TP4)', () => {
  const photoAt = (offsetMin: number): ExifFacts => ({ gps: null, takenAt: minutes(CAPTURED_AT, offsetMin) });
  const noTime: ExifFacts = { gps: null, takenAt: null };

  describe('EXIF–client gap (worst photo time vs capturedAt; client = server; EXE10)', () => {
    it.each([
      [-2, 'ok', 'Photo time 2 min'],
      [-9, 'ok', 'Photo time 9 min'], // EVAL-011
      [-10, 'ok', 'Photo time 10 min'],
      [10, 'ok', 'Photo time 10 min'], // a photo stamped after the capture counts the same
      [-11, 'flag', 'Photo time 11 min'],
      [-119, 'flag', 'Photo time 119 min'],
      [-120, 'flag', 'Photo time 2 h'], // EVAL-056; §6.5: N min under 120 min, N h from there
      [-1380, 'flag', 'Photo time 23 h'], // EVAL-122
      [-1440, 'flag', 'Photo time 24 h'],
      [1440, 'flag', 'Photo time 24 h'],
      [-1441, 'fail', 'Photo time 24 h 1 min from capture time (limit 10 min); phone clock 0 min from server (limit 24 h) (fail over 24 h)'], // QA-P5-5
      [-1500, 'fail', 'Photo time 25 h'], // EVAL-123
      [-4320, 'fail', 'Photo time 3 days'], // EVAL-034
      [-64_800, 'fail', 'Photo time 45 days'], // EVAL-033
    ] as const)('%d min → %s', async (offset, status, text) => {
      const r = await run('exif_time_agreement', await sub([photoAt(offset)]));
      expect(r).toMatchObject({ status, hardFail: false });
      expect(r.evidence).toContain(text);
    });

    it('an EXIF gap over 24 h names the 24 h limit, never the 7-day one', async () => {
      const r = await run('exif_time_agreement', await sub([photoAt(-4320)]));
      expect(r.evidence).toBe('Photo time 3 days from capture time (limit 10 min); phone clock 0 min from server (limit 24 h) (fail over 24 h)');
    });

    it('names both limits and both gaps', async () => {
      const r = await run('exif_time_agreement', await sub([photoAt(-2)], { serverReceivedAt: minutes(CAPTURED_AT, 1) }));
      expect(r.evidence).toBe('Photo time 2 min from capture time (limit 10 min); phone clock 1 min from server (limit 24 h)');
    });

    it('the worst photo decides', async () => {
      expect(await run('exif_time_agreement', await sub([photoAt(-2), photoAt(-4320)]))).toMatchObject({
        status: 'fail',
        evidence: 'Photo time 3 days from capture time (limit 10 min); phone clock 0 min from server (limit 24 h) (fail over 24 h)',
      });
      expect(await run('exif_time_agreement', await sub([photoAt(-4320), photoAt(-3)]))).toMatchObject({ status: 'fail' });
      expect(await run('exif_time_agreement', await sub([photoAt(-2), photoAt(-11)]))).toMatchObject({ status: 'flag', evidence: expect.stringContaining('Photo time 11 min') });
      expect(await run('exif_time_agreement', await sub([photoAt(-11), photoAt(2)]))).toMatchObject({ status: 'flag', evidence: expect.stringContaining('Photo time 11 min') });
    });

    it('photos without EXIF time are ignored while another photo has one', async () => {
      expect(await run('exif_time_agreement', await sub([noTime, photoAt(-2)]))).toMatchObject({ status: 'ok', evidence: expect.stringContaining('Photo time 2 min') });
      expect((await run('exif_time_agreement', await sub([photoAt(-30), noTime]))).evidence).toContain('Photo time 30 min');
    });

    it('EXIF time absent on every photo → flag "Photo has no time data" (GAP-1)', async () => {
      const r = await run('exif_time_agreement', await sub([noTime, noTime]));
      expect(r).toMatchObject({ status: 'flag', evidence: 'Photo has no time data; phone clock 0 min from server (limit 24 h)' });
    });
  });

  describe('client–server gap (capturedAt vs serverReceivedAt; EXIF matches the client)', () => {
    const clock = async (offsetMin: number) =>
      run('exif_time_agreement', await sub([photoAt(0)], { capturedAt: CAPTURED_AT, serverReceivedAt: minutes(CAPTURED_AT, -offsetMin) }));
    it.each([
      [0, 'ok', 'phone clock 0 min'],
      [-23 * 60, 'ok', 'phone clock 23 h'],
      [-24 * 60, 'ok', 'phone clock 24 h'],
      [-(24 * 60 + 1), 'flag', 'phone clock 24 h 1 min from server (limit 24 h)'], // QA-P5-5
      [-4320, 'flag', 'phone clock 3 days'], // EVAL-055
      [-10_080, 'flag', 'phone clock 7 days'],
      [-10_081, 'fail', 'phone clock 7 days 1 min from server (limit 24 h) (fail over 7 days)'], // QA-P5-5
      [-12_960, 'fail', 'phone clock 9 days'], // EVAL-057
      [-14_400, 'fail', 'phone clock 10 days'], // EVAL-035
      [24 * 60 + 1, 'flag', 'phone clock 24 h 1 min'], // a clock running ahead
    ] as const)('client %d min off the server → %s', async (offset, status, text) => {
      const r = await clock(offset);
      expect(r).toMatchObject({ status, hardFail: false });
      expect(r.evidence).toContain(text);
    });
  });

  it('the worse gap decides and the sentence reports both', async () => {
    const r = await run('exif_time_agreement', await sub([photoAt(-11)], { serverReceivedAt: minutes(CAPTURED_AT, 12_960) }));
    expect(r.status).toBe('fail');
    expect(r.evidence).toBe('Photo time 11 min from capture time (limit 10 min); phone clock 9 days from server (limit 24 h) (fail over 7 days)');
    const noExif = await run('exif_time_agreement', await sub([noTime], { serverReceivedAt: minutes(CAPTURED_AT, 12_960) }));
    expect(noExif).toMatchObject({ status: 'fail', evidence: 'Photo has no time data; phone clock 9 days from server (limit 24 h) (fail over 7 days)' });
  });

  it('two flags stay a flag; the fail sentence names every limit that was crossed (EXE10)', async () => {
    const flags = await run('exif_time_agreement', await sub([photoAt(-1380)], { serverReceivedAt: minutes(CAPTURED_AT, 4320) }));
    expect(flags).toMatchObject({ status: 'flag', evidence: 'Photo time 23 h from capture time (limit 10 min); phone clock 3 days from server (limit 24 h)' });
    const exifOnly = await run('exif_time_agreement', await sub([photoAt(-1500)], { serverReceivedAt: minutes(CAPTURED_AT, 4320) }));
    expect(exifOnly).toMatchObject({ status: 'fail', evidence: 'Photo time 25 h from capture time (limit 10 min); phone clock 3 days from server (limit 24 h) (fail over 24 h)' });
    const both = await run('exif_time_agreement', await sub([photoAt(-1500)], { serverReceivedAt: minutes(CAPTURED_AT, 12_960) }));
    expect(both).toMatchObject({
      status: 'fail',
      hardFail: false,
      evidence: 'Photo time 25 h from capture time (limit 10 min); phone clock 9 days from server (limit 24 h) (fail over 24 h; fail over 7 days)',
    });
  });
});

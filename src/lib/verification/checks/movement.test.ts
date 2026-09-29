import { beforeAll, describe, expect, it } from 'vitest';
import { CENTRE, makeContext, makeDevice, makeSubmission, type TestDevice } from '../../../../tests/helpers/verify';
import { haversineM } from '../../geo/distance';
import type { LatLng } from '../../geo/types';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import { runCheck } from '../verify';

// TC-037 (movement part), technical-plan §22 TSK-08.5 and §6.3: implied speed from this phone's
// previous accepted entry, on client timestamps (what the agent claims). EVAL-013/028 pin the 120 km/h
// boundary; EVAL-024 the rounding ("338 km/h").

let dev: TestDevice;
beforeAll(async () => {
  dev = await makeDevice();
});

const movement = (): Check => {
  const c = REGISTRY.find((x) => x.id === 'movement_plausibility');
  if (!c) throw new Error('movement_plausibility is not in the registry');
  return c;
};

const M_PER_DEG = 111_195.08;
const CAPTURED_AT = '2026-12-08T05:30:00.000Z';
const before = (min: number) => new Date(Date.parse(CAPTURED_AT) - min * 60_000).toISOString();

/** A point due north of `from` at least `m` metres away by haversineM (never a hair short). */
function north(from: LatLng, m: number): LatLng {
  let p = { lat: from.lat + m / M_PER_DEG, lng: from.lng };
  while (haversineM(from, p) < m) p = { lat: p.lat + 1e-12, lng: p.lng };
  return p;
}

/** The previous entry `km` away, `minutes` before this capture. */
async function run(prev: { km: number; minutes: number } | null) {
  const sub = await makeSubmission({ device: dev, gps: { ...CENTRE, accuracyM: 8 }, capturedAt: CAPTURED_AT });
  const previousEvent = prev ? { ...north(CENTRE, prev.km * 1000), capturedAt: before(prev.minutes) } : null;
  return runCheck(movement(), sub, makeContext(dev, { previousEvent }), CONFIG);
}

describe('movement_plausibility (TC-037)', () => {
  it('no previous event → ok "First entry from this phone"', async () => {
    expect(await run(null)).toMatchObject({ status: 'ok', hardFail: false, evidence: 'First entry from this phone' });
  });

  it('EVAL-013: 25 km in 20 min (75 km/h) → ok', async () => {
    expect(await run({ km: 25, minutes: 20 })).toMatchObject({
      status: 'ok',
      evidence: 'Implied speed 75 km/h from the previous entry 25000 m away 20 min earlier (limit 120 km/h)',
    });
  });

  it('EVAL-002: 100 m in 45 min → ok', async () => {
    expect((await run({ km: 0.1, minutes: 45 })).status).toBe('ok');
  });

  it.each([
    [119, 'ok'],
    [120, 'fail'],
    [150, 'fail'], // EVAL-028: 25 km in 10 min
  ] as const)('%d km/h → %s', async (v, status) => {
    const r = await run({ km: v / 6, minutes: 10 });
    expect(r).toMatchObject({ status, hardFail: false });
    expect(r.evidence).toContain(`${v} km/h from the previous entry`);
  });

  it('EVAL-028: 150 km/h names the speed, whole metres and minutes', async () => {
    expect((await run({ km: 25, minutes: 10 })).evidence).toBe(
      'Implied speed 150 km/h from the previous entry 25000 m away 10 min earlier (limit 120 km/h)',
    );
  });

  it('EVAL-024: 45 km in 8 min → fail "338 km/h" (337.5 rounded)', async () => {
    const r = await run({ km: 45, minutes: 8 });
    expect(r.status).toBe('fail');
    expect(r.evidence).toBe('Implied speed 338 km/h from the previous entry 45000 m away 8 min earlier (limit 120 km/h)');
  });

  it('EVAL-112: 21 km in 10 min → fail "126 km/h"', async () => {
    expect((await run({ km: 21, minutes: 10 })).evidence).toContain('126 km/h');
  });

  it.each([0, -5])('a clock that did not advance (%d min) → fail "time did not advance"', async (minutes) => {
    const r = await run({ km: 0.1, minutes }); // the previous entry is stamped at or after this one
    expect(r).toMatchObject({ status: 'fail', hardFail: false });
    expect(r.evidence).toContain('time did not advance');
    expect(r.evidence).toContain('100 m');
    expect(r.evidence).toContain(`${minutes} min`);
  });
});

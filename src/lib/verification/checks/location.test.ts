import { beforeAll, describe, expect, it } from 'vitest';
import { generateDeviceKeys, loadHarnessInputs, type DeviceKeys, type HarnessInputs } from '../../../../evals/harness/context';
import { loadDataset, type EvalCase, type Mutation } from '../../../../evals/harness/dataset';
import { buildCase, type BuiltCase } from '../../../../evals/harness/mutate';
import { locate } from '../../geo/geofence';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import type { CheckId } from '../types';
import { runCheck } from '../verify';

// TC-036 (location part), technical-plan §22 TSK-08.3 and §6.3: geofence with the accuracy buffer
// min(accuracy, 25 m) on the TKT-03 plot fixtures, points placed by the mutation engine's gps_place,
// and gps_accuracy at every threshold. Expected statuses and sentences are literals from the spec.

const ds = loadDataset();
let inputs: HarnessInputs;
let keys: DeviceKeys;
beforeAll(async () => {
  inputs = loadHarnessInputs(ds);
  keys = await generateDeviceKeys(ds);
});

const base = ds.cases.find((c) => c.id === 'EVAL-001')!;
/** A capture on `plot` with the given mutations on top of EVAL-001. */
const place = (plot: string, mutations: Mutation[]): Promise<BuiltCase> =>
  buildCase({ ...base, id: 'EVAL-900', input: { plot, device: 'D-A1', base_case: 'EVAL-001', mutations } } as EvalCase, inputs, keys);

const check = (id: CheckId): Check => {
  const c = REGISTRY.find((x) => x.id === id);
  if (!c) throw new Error(`${id} is not in the registry`);
  return c;
};
const run = (id: CheckId, b: BuiltCase) => runCheck(check(id), b.submission, b.context, CONFIG);
const withAccuracy = (b: BuiltCase, accuracyM: number): BuiltCase => ({
  ...b,
  submission: { ...b.submission, payload: { ...b.submission.payload, gps: { ...b.submission.payload.gps, accuracyM } } },
});

describe('geofence (TC-036; EVAL-005, 009, 022, 025, 026, 027)', () => {
  it('EVAL-005: P04, 15 m inside next to the notch → ok "Inside the plot, 15 m from the edge"', async () => {
    const r = await run('geofence', await place('P04', [{ op: 'gps_place', where: 'inside_near_edge', distance_m: 15 }]));
    expect(r).toMatchObject({ status: 'ok', hardFail: false, evidence: 'Inside the plot, 15 m from the edge' });
  });

  it('EVAL-026: P04, 40 m into the notch (inside the bounding box, outside the polygon) → fail', async () => {
    const b = await place('P04', [
      { op: 'gps_place', where: 'outside_notch', distance_m: 40 },
      { op: 'gps_accuracy', accuracy_m: 10 },
    ]);
    const r = await run('geofence', b);
    expect(r).toMatchObject({ status: 'fail', hardFail: false, evidence: '40 m outside the plot edge (allowance 10 m)' });
  });

  it('EVAL-009: 12 m outside at accuracy 20 → flag, within the 20 m allowance', async () => {
    const b = await place('P08', [
      { op: 'gps_place', where: 'outside_edge', distance_m: 12 },
      { op: 'gps_accuracy', accuracy_m: 20 },
    ]);
    expect(await run('geofence', b)).toMatchObject({ status: 'flag', evidence: '12 m outside the plot edge, within the 20 m GPS allowance' });
  });

  it('EVAL-025: 30 m outside at accuracy 8 → fail (allowance 8 m)', async () => {
    const b = await place('P07', [
      { op: 'gps_place', where: 'outside_edge', distance_m: 30 },
      { op: 'gps_accuracy', accuracy_m: 8 },
    ]);
    expect(await run('geofence', b)).toMatchObject({ status: 'fail', evidence: '30 m outside the plot edge (allowance 8 m)' });
  });

  it('EVAL-027: 26 m outside at accuracy 60 → fail (allowance capped at 25 m); TC-036: same at accuracy 40', async () => {
    const b = await place('P08', [
      { op: 'gps_place', where: 'outside_edge', distance_m: 26 },
      { op: 'gps_accuracy', accuracy_m: 60 },
    ]);
    expect(await run('geofence', b)).toMatchObject({ status: 'fail', evidence: '26 m outside the plot edge (allowance 25 m)' });
    expect(await run('geofence', withAccuracy(b, 40))).toMatchObject({ status: 'fail', evidence: '26 m outside the plot edge (allowance 25 m)' });
  });

  it('EVAL-022: 2400 m outside → fail "2400 m"', async () => {
    const r = await run('geofence', await place('P01', [{ op: 'gps_place', where: 'outside_edge', distance_m: 2400 }]));
    expect(r.status).toBe('fail');
    expect(r.evidence).toBe('2400 m outside the plot edge (allowance 8 m)');
  });

  it('buffer boundary: distance == buffer → flag; buffer + 1 m → fail (compared on raw metres)', async () => {
    const b = await place('P08', [{ op: 'gps_place', where: 'outside_edge', distance_m: 20 }]);
    const d = locate(b.submission.payload.gps, b.context.plot.polygon).distanceToEdgeM;
    expect(d).toBeCloseTo(20, 1);
    expect((await run('geofence', withAccuracy(b, d))).status).toBe('flag'); // buffer = min(d, 25) = d
    expect((await run('geofence', withAccuracy(b, d - 1))).status).toBe('fail'); // the point is buffer + 1 m out
    // poor accuracy widens the buffer only up to the 25 m cap
    expect((await run('geofence', withAccuracy(b, 60))).status).toBe('flag');
    const c = await place('P08', [{ op: 'gps_place', where: 'outside_edge', distance_m: 26 }]);
    expect((await run('geofence', withAccuracy(c, 60))).status).toBe('fail');
  });
});

describe('gps_accuracy (TC-036; EVAL-010, 020, 027)', () => {
  const cases: [number, 'ok' | 'flag' | 'fail'][] = [
    [8, 'ok'],
    [28, 'ok'], // EVAL-010
    [29.9, 'ok'],
    [30, 'flag'],
    [60, 'flag'], // EVAL-027
    [99.9, 'flag'],
    [100, 'fail'],
    [150, 'fail'], // EVAL-020
  ];
  it.each(cases)('accuracy %d m → %s', async (a, status) => {
    const b = withAccuracy(await place('P08', []), a);
    expect(await run('gps_accuracy', b)).toMatchObject({ status, hardFail: false });
  });

  it('names the measured value and both thresholds', async () => {
    const b = withAccuracy(await place('P06', []), 150);
    expect((await run('gps_accuracy', b)).evidence).toBe('GPS accuracy 150 m (good under 30 m, limit 100 m)');
    expect((await run('gps_accuracy', withAccuracy(b, 28))).evidence).toBe('GPS accuracy 28 m (good under 30 m, limit 100 m)');
  });
});

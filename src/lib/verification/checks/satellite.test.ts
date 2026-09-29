import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProfile, type ProfileSpec } from '../../../../evals/fixtures/remote-sensing/profiles';
import { makeContext, makeDevice, makeSubmission, type TestDevice } from '../../../../tests/helpers/verify';
import { withTimeouts } from '../../remote-sensing';
import { createFixtureProvider, type FaultMode } from '../../remote-sensing/fixture';
import type { NdviHistory, NdviWindow, ProviderName, RemoteSensingProvider } from '../../remote-sensing/types';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import type { CheckResult, VerifyContext } from '../types';
import { runCheck, verify, verifyWith } from '../verify';
import { deforestationOverlap } from './deforestation_overlap';
import { ndviCultivation } from './ndvi_cultivation';
import { ndviHarvestWindow } from './ndvi_harvest_window';

// TSK-07.3 · the three satellite checks (technical-plan §6.3, TP11, S5, S6) and the 10 s remote-phase
// cap. TC-032 (timeouts, HTTP errors and malformed bodies never reject), TC-011 rows for the three
// checks, TC-031 (cloud-blocked window) and the EVAL-level expectations of EVAL-006, 015–017, 019,
// 037–043. Expected sentences are literals from §6.5 with the TP11 thresholds.

const SATELLITE: readonly Check[] = [deforestationOverlap, ndviCultivation, ndviHarvestWindow];

let device: TestDevice;
const sub = async () => {
  device ??= await makeDevice();
  return makeSubmission({ device });
};
const ctxWith = async (remoteSensing: RemoteSensingProvider, plot: Partial<VerifyContext['plot']> = {}) => {
  device ??= await makeDevice();
  const base = makeContext(device, { remoteSensing });
  return { ...base, plot: { ...base.plot, ...plot } };
};
const fixture = (spec: Partial<ProfileSpec> = {}, faults: { provider: ProviderName; mode: FaultMode }[] = []) =>
  createFixtureProvider({
    profiles: {},
    faults,
    fallback: buildProfile({ plotId: 'PL-TEST', areaHa: 2, lossPct: 0, history: 'perennial_canopy', window: 'living_canopy', ...spec }),
  });
/** A provider that answers one fixed thing per call kind (numbers the fixture profiles do not have). */
const answering = (a: { lossPct?: number; history?: NdviHistory; window?: NdviWindow }): RemoteSensingProvider => {
  const honest = fixture();
  return {
    name: 'fixture',
    forestLoss: async (p, o) => (a.lossPct === undefined ? honest.forestLoss(p, o) : { lossHa: 0, lossPct: a.lossPct, yearsFrom: 2021, dataYear: 2025 }),
    ndviHistory: async (p, m, o) => a.history ?? honest.ndviHistory(p, m, o),
    ndviWindow: async (p, d, n, o) => a.window ?? honest.ndviWindow(p, d, n, o),
  };
};
const run = async (check: Check, rs: RemoteSensingProvider) => runCheck(check, await sub(), await ctxWith(rs), CONFIG);

afterEach(() => {
  vi.useRealTimers();
});

describe('registry', () => {
  it('registers the three satellite checks as remote, with their provider, in §6.3 order', () => {
    const remote = REGISTRY.filter((c) => c.kind === 'remote').map((c) => [c.id, c.provider]);
    expect(remote).toEqual([
      ['deforestation_overlap', 'gfw'],
      ['ndvi_cultivation', 'sentinel-hub'],
      ['ndvi_harvest_window', 'sentinel-hub'],
    ]);
  });
});

describe('deforestation_overlap (S5: any loss flags, ≥ 10.0 % hard fails)', () => {
  it.each([
    [0, 'ok', false, '0.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    [3.0, 'flag', false, '3.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    [9.5, 'flag', false, '9.5% of plot area lost since 2021 (hard fail at 10.0%)'],
    [9.96, 'flag', false, '10.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    [10.0, 'fail', true, '10.0% of plot area lost since 2021 (hard fail at 10.0%)'],
    [10.5, 'fail', true, '10.5% of plot area lost since 2021 (hard fail at 10.0%)'],
    [25.0, 'fail', true, '25.0% of plot area lost since 2021 (hard fail at 10.0%)'],
  ] as const)('lossPct %s → %s (hardFail %s)', async (lossPct, status, hardFail, sentence) => {
    const r = await run(deforestationOverlap, answering({ lossPct }));
    expect(r).toMatchObject({ id: 'deforestation_overlap', status, hardFail, evidence: sentence });
    expect(r.provider).toBeUndefined(); // the provider answered: nothing to re-run
  });

  it('a nonsensical loss (negative, NaN, over 100) is a malformed answer: unavailable, never a verdict', async () => {
    for (const lossPct of [-1, Number.NaN, 140]) {
      expect(await run(deforestationOverlap, answering({ lossPct }))).toMatchObject({ status: 'unavailable', provider: 'gfw', hardFail: false });
    }
  });

  it('reads the fixture profile of the plot (X02 10.5 % → hard fail; P05 loss only outside → ok)', async () => {
    expect(await run(deforestationOverlap, fixture({ lossPct: 10.5 }))).toMatchObject({ status: 'fail', hardFail: true });
    expect(await run(deforestationOverlap, fixture({ lossPct: 0, lossAdjacentOutside: true }))).toMatchObject({ status: 'ok' });
  });
});

describe('ndvi_cultivation (TP11: ≥ 6 clear months, min ≥ 0.50, swing ≤ 0.35)', () => {
  it('perennial_canopy → ok with the monthly range and clear months', async () => {
    expect(await run(ndviCultivation, fixture({ history: 'perennial_canopy' }))).toMatchObject({
      status: 'ok',
      evidence: 'Canopy all year: monthly NDVI 0.62–0.81 over 11 clear months (needs ≥ 0.50, swing ≤ 0.35)',
    });
  });

  it('cleared_then_planted → fail naming 0.21', async () => {
    const r = await run(ndviCultivation, fixture({ history: 'cleared_then_planted' }));
    expect(r).toMatchObject({ status: 'fail', hardFail: false });
    expect(r.evidence).toContain('0.21');
    expect(r.evidence).toContain('0.50');
  });

  it('annual_crop → fail (lowest month 0.28, swing 0.46)', async () => {
    const r = await run(ndviCultivation, fixture({ history: 'annual_crop' }));
    expect(r).toMatchObject({ status: 'fail' });
    expect(r.evidence).toBe('No year-round canopy over 11 clear months: lowest month NDVI 0.28 (needs ≥ 0.50); seasonal swing 0.46 (limit 0.35)');
  });

  const months = (means: (number | null)[]): NdviHistory => ({
    months: means.map((mean, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, mean, clearFraction: mean === null ? 0 : 0.9 })),
  });

  it('fewer than 6 clear months → unavailable (not the provider’s fault: no provider named)', async () => {
    const r = await run(ndviCultivation, answering({ history: months([0.7, 0.7, 0.7, 0.7, 0.7, null, null, null, null, null, null, null]) }));
    expect(r).toMatchObject({ status: 'unavailable', evidence: 'Only 5 clear months of satellite data (needs 6)' });
    expect(r.provider).toBeUndefined();
  });

  it('boundaries: min exactly 0.50 and swing exactly 0.35 are ok; 0.49 or a 0.36 swing fail', async () => {
    const six = (a: number, b: number) => months([a, b, a, b, a, b, null, null, null, null, null, null]);
    expect((await run(ndviCultivation, answering({ history: six(0.5, 0.85) }))).status).toBe('ok');
    expect((await run(ndviCultivation, answering({ history: six(0.49, 0.8) }))).status).toBe('fail');
    expect((await run(ndviCultivation, answering({ history: six(0.5, 0.86) }))).status).toBe('fail');
  });

  it('ends the history at the plot’s registration month, else at the capture month in IST', async () => {
    const asked: string[] = [];
    const spy: RemoteSensingProvider = { ...answering({}), ndviHistory: async (p, endMonth, o) => (asked.push(endMonth), fixture().ndviHistory(p, endMonth, o)) };
    await runCheck(ndviCultivation, await sub(), await ctxWith(spy, { historyEndMonth: '2026-06' }), CONFIG);
    await runCheck(ndviCultivation, await sub(), await ctxWith(spy), CONFIG); // received 2026-10-14T04:12Z
    expect(asked).toEqual(['2026-06', '2026-10']);
  });
});

describe('ndvi_harvest_window (TP11: ≥ 0.45 ok, 0.30–0.45 flag, < 0.30 fail)', () => {
  it.each([
    [0.71, 'ok', 'Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45)'],
    [0.45, 'ok', 'Living canopy around the picking date: NDVI 0.45 (needs ≥ 0.45)'],
    [0.4, 'flag', 'Living canopy around the picking date: NDVI 0.40 (needs ≥ 0.45)'],
    [0.3, 'flag', 'Living canopy around the picking date: NDVI 0.30 (needs ≥ 0.45)'],
    [0.22, 'fail', 'Living canopy around the picking date: NDVI 0.22 (needs ≥ 0.45, fail below 0.30)'],
  ] as const)('mean %s → %s', async (mean, status, sentence) => {
    expect(await run(ndviHarvestWindow, answering({ window: { mean, clearObservations: 3 } }))).toMatchObject({ status, hardFail: false, evidence: sentence });
  });

  it('cloud_blocked (TC-031, EVAL-015) → unavailable with the cloud sentence', async () => {
    const r = await run(ndviHarvestWindow, fixture({ window: 'cloud_blocked' }));
    expect(r).toMatchObject({ status: 'unavailable', evidence: 'Satellite view blocked by cloud for ±30 days' });
    expect(r.provider).toBeUndefined();
  });

  it('asks for ±30 days around the receipt date in IST', async () => {
    const asked: [string, number][] = [];
    const spy: RemoteSensingProvider = { ...answering({}), ndviWindow: async (p, d, n, o) => (asked.push([d, n]), fixture().ndviWindow(p, d, n, o)) };
    const s = { ...(await sub()), serverReceivedAt: '2026-12-07T19:00:00.000Z' }; // 8 Dec 00:30 IST
    await runCheck(ndviHarvestWindow, s, await ctxWith(spy), CONFIG);
    expect(asked).toEqual([['2026-12-08', 30]]);
  });
});

describe('provider failures never reject (TC-032, S6, EVAL-016/017)', () => {
  const cases: [ProviderName, FaultMode, string[], string][] = [
    ['gfw', 'timeout', ['deforestation_overlap'], 'Forest-loss data unavailable: timeout; an admin re-run will retry'],
    ['gfw', 'http_500', ['deforestation_overlap'], 'Forest-loss data unavailable: HTTP 500; an admin re-run will retry'],
    ['gfw', 'malformed', ['deforestation_overlap'], 'Forest-loss data unavailable: malformed response; an admin re-run will retry'],
    ['sentinel-hub', 'timeout', ['ndvi_cultivation', 'ndvi_harvest_window'], 'Satellite NDVI data unavailable: timeout; an admin re-run will retry'],
    ['sentinel-hub', 'http_500', ['ndvi_cultivation', 'ndvi_harvest_window'], 'Satellite NDVI data unavailable: HTTP 500; an admin re-run will retry'],
    ['sentinel-hub', 'malformed', ['ndvi_cultivation', 'ndvi_harvest_window'], 'Satellite NDVI data unavailable: malformed response; an admin re-run will retry'],
  ];

  it.each(cases)('%s %s → unavailable, provider listed, Needs Review', async (provider, mode, ids, sentence) => {
    // With GFW down, a 10.5 % plot: were the failure read as data, the verdict would be a hard-fail
    // rejection. The timeout fault never answers; the per-call 8 s timeout (withTimeouts) is what ends
    // it in the app, so it is applied here with a short deadline.
    const rs = withTimeouts(fixture({ lossPct: provider === 'gfw' ? 10.5 : 0 }, [{ provider, mode }]), { timeoutMs: 20 });
    const res = await verifyWith(SATELLITE, await sub(), await ctxWith(rs), undefined, CONFIG);
    for (const id of ids) {
      expect(res.checks.find((c) => c.id === id)).toMatchObject({ status: 'unavailable', provider, hardFail: false, evidence: id === 'deforestation_overlap' ? sentence : expect.any(String) });
    }
    if (provider === 'sentinel-hub') expect(res.checks.find((c) => c.id === 'ndvi_harvest_window')!.evidence).toBe(sentence);
    expect(res.unavailableProviders).toEqual([provider]);
    expect(res.verdict).toBe('Needs Review');
  });

  it('EVAL-016 / EVAL-017 through the full registry: Needs Review, the provider named, never Rejected', async () => {
    const config = { ...CONFIG, providers: { ...CONFIG.providers, remotePhaseCapMs: 50 } };
    for (const fault of [{ provider: 'sentinel-hub', mode: 'timeout' }, { provider: 'gfw', mode: 'http_500' }] as const) {
      const lossPct = fault.provider === 'gfw' ? 25 : 0; // GFW down on a 25 % plot must not reject either
      const res = await verifyWith(REGISTRY, await sub(), await ctxWith(fixture({ lossPct }, [fault])), undefined, config);
      expect(res.verdict).not.toBe('Rejected');
      expect(res.unavailableProviders).toEqual([fault.provider]);
    }
    const res = await verify(await sub(), await ctxWith(fixture({}, [{ provider: 'gfw', mode: 'http_500' }])));
    expect(res.verdict).toBe('Needs Review');
    expect(res.capReasons).toContain('anyUnavailable');
  });
});

describe('the 10 s remote-phase cap', () => {
  it('with ndviWindow answering after 12 s the phase ends at 10 s: unavailable "no answer within 10 s", call aborted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    let lossAnswered = false;
    const slow = createFixtureProvider({
      profiles: {},
      delayMs: { ndviWindow: 12_000 },
      fallback: buildProfile({ plotId: 'PL-TEST', areaHa: 2, lossPct: 0, history: 'perennial_canopy', window: 'living_canopy' }),
    });
    const rs: RemoteSensingProvider = {
      ...slow,
      name: 'fixture',
      forestLoss: (p, o) => slow.forestLoss(p, o).finally(() => (lossAnswered = true)),
      ndviHistory: (p, m, o) => slow.ndviHistory(p, m, o),
      ndviWindow: (p, d, n, o) => ((signal = o?.signal), slow.ndviWindow(p, d, n, o)),
    };
    let done: Awaited<ReturnType<typeof verifyWith>> | undefined;
    void verifyWith(SATELLITE, await sub(), await ctxWith(rs), undefined, CONFIG).then((r) => (done = r));
    // The checks hash the plot (real async crypto) before calling the provider: wait for the calls
    // without moving the fake clock (setImmediate is not faked here; vi.waitUntil would advance it).
    while (signal === undefined || !lossAnswered) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBeDefined();
    const w = done!.checks.find((c) => c.id === 'ndvi_harvest_window') as CheckResult;
    expect(w).toMatchObject({
      status: 'unavailable',
      provider: 'sentinel-hub',
      evidence: 'Satellite NDVI data unavailable: no answer within 10 s; an admin re-run will retry',
    });
    expect(done!.checks.find((c) => c.id === 'deforestation_overlap')).toMatchObject({ status: 'ok' });
    expect(done!.unavailableProviders).toEqual(['sentinel-hub']);
    expect(done!.verdict).toBe('Needs Review');
    expect(signal?.aborted).toBe(true); // the in-flight call was told to stop (carry-forward from TKT-02)
  });
});

import { describe, expect, it } from 'vitest';
import { FixtureProvider, type RsProfile } from './fixture';
import { ProviderError, type PlotGeom } from './types';

// TSK-03.3: the fixture remote-sensing provider answers from per-plot profiles; faults come only from
// the constructor (never env). Profiles here are literal copies of evals/fixtures/remote-sensing/*.json.

const SQUARE: PlotGeom['polygon'] = {
  type: 'Polygon',
  coordinates: [
    [
      [75.74, 12.42],
      [75.741, 12.42],
      [75.741, 12.421],
      [75.74, 12.421],
      [75.74, 12.42],
    ],
  ],
};
const geom = (id: string, areaHa: number): PlotGeom => ({ id, polygon: SQUARE, areaHa });

const PERENNIAL = [0.7, 0.66, 0.62, 0.64, 0.69, 0.76, null, 0.81, 0.8, 0.78, 0.75, 0.72];
const profile = (plotId: string, lossPct: number, areaHa: number, window: RsProfile['ndviWindow']): RsProfile => ({
  plotId,
  forestLoss: { lossPct, lossHa: (lossPct * areaHa) / 100, yearsFrom: 2021, dataYear: 2025, lossAdjacentOutside: false },
  ndviHistory: {
    profile: 'perennial_canopy',
    byCalendarMonth: PERENNIAL.map((mean, i) => ({ month: i + 1, mean, clearFraction: mean === null ? 0 : 0.9 })),
  },
  ndviWindow: window,
});
const LIVING = { profile: 'living_canopy', mean: 0.71, clearObservations: 4 } as const;
const PROFILES: Record<string, RsProfile> = {
  P01: profile('P01', 0, 2, LIVING),
  X02: profile('X02', 10.5, 1, LIVING),
  P09: profile('P09', 0, 1.8, { profile: 'cloud_blocked', mean: null, clearObservations: 0 }),
};

describe('FixtureProvider', () => {
  const rs = new FixtureProvider({ profiles: PROFILES });

  it('is named fixture', () => {
    expect(rs.name).toBe('fixture');
  });

  it('P01 → lossPct 0', async () => {
    expect(await rs.forestLoss(geom('P01', 2))).toEqual({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025 });
  });

  it('X02 → lossPct 10.5', async () => {
    expect((await rs.forestLoss(geom('X02', 1))).lossPct).toBe(10.5);
  });

  it('P09 harvest window → { mean: null, clearObservations: 0 }', async () => {
    expect(await rs.ndviWindow(geom('P09', 1.8), '2026-12-08', 30)).toEqual({ mean: null, clearObservations: 0 });
  });

  it('ndviHistory returns the 12 months ending at endMonth, July cloud-covered', async () => {
    const { months } = await rs.ndviHistory(geom('P01', 2), '2027-02');
    expect(months.map((m) => m.month)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
      '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
    ]);
    expect(months[0]).toEqual({ month: '2026-03', mean: 0.62, clearFraction: 0.9 });
    expect(months[4]).toEqual({ month: '2026-07', mean: null, clearFraction: 0 });
  });

  it('an unknown plot rejects', async () => {
    await expect(rs.forestLoss(geom('P77', 1))).rejects.toThrow(/P77/);
  });
});

describe('FixtureProvider fault injection', () => {
  it("http_500 on gfw rejects with ProviderError('gfw', 500) and leaves sentinel-hub alone", async () => {
    const rs = new FixtureProvider({ profiles: PROFILES, faults: [{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }] });
    const err = await rs.forestLoss(geom('P01', 2)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ provider: 'gfw', kind: 'http', status: 500 });
    expect(err).toEqual(new ProviderError('gfw', 500));
    expect(await rs.ndviWindow(geom('P01', 2), '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4 });
  });

  it('malformed on sentinel-hub rejects both NDVI calls with kind malformed', async () => {
    const rs = new FixtureProvider({ profiles: PROFILES, faults: [{ provider: 'sentinel-hub', mode: 'malformed' }] });
    await expect(rs.ndviHistory(geom('P01', 2), '2026-12')).rejects.toMatchObject({ provider: 'sentinel-hub', kind: 'malformed' });
    await expect(rs.ndviWindow(geom('P01', 2), '2026-12-08', 30)).rejects.toMatchObject({ provider: 'sentinel-hub', kind: 'malformed' });
    expect((await rs.forestLoss(geom('P01', 2))).lossPct).toBe(0);
  });

  it('timeout never settles on its own and rejects with kind timeout when the AbortSignal fires', async () => {
    const rs = new FixtureProvider({ profiles: PROFILES, faults: [{ provider: 'sentinel-hub', mode: 'timeout' }] });
    const ctl = new AbortController();
    let settled = false;
    const p = rs.ndviWindow(geom('P01', 2), '2026-12-08', 30, { signal: ctl.signal }).finally(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ provider: 'sentinel-hub', kind: 'timeout' });
  });

  it('timeout with an already-aborted signal rejects at once', async () => {
    const rs = new FixtureProvider({ profiles: PROFILES, faults: [{ provider: 'gfw', mode: 'timeout' }] });
    await expect(rs.forestLoss(geom('P01', 2), { signal: AbortSignal.abort() })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('exposes the injected faults (cacheEmpty is recorded for the cache wrapper)', () => {
    const faults = [{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }] as const;
    expect(new FixtureProvider({ profiles: PROFILES, faults: [...faults] }).faults).toEqual(faults);
  });
});

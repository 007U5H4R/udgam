import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureProvider, FixtureProvider, loadFixtureSet, type RsProfile } from './fixture';
import { ProviderError, type PlotGeom } from './types';

// TSK-03.3 / TSK-07.1: the fixture remote-sensing provider answers from per-plot profiles; faults and
// delays come only from the constructor (never env). Expected numbers are the literal profile values of
// technical-plan TSK-07.1 (perennial 0.62–0.81 over 11 clear months, cleared_then_planted dips to 0.21,
// annual_crop 0.28–0.74, living canopy 0.71 over 4, cloud_blocked null over 0, bare 0.22 over 3).

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
const geom = (id: string, areaHa: number, geometryHash = 'h-' + id): PlotGeom => ({ id, polygon: SQUARE, areaHa, geometryHash });

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

afterEach(() => {
  vi.useRealTimers();
});

describe('FixtureProvider', () => {
  const rs = new FixtureProvider({ profiles: PROFILES });

  it('is named fixture', () => {
    expect(rs.name).toBe('fixture');
  });

  it('P01 → lossPct 0', async () => {
    expect(await rs.forestLoss(geom('P01', 2))).toEqual({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025, source: 'fixture' });
  });

  it('X02 → lossPct 10.5', async () => {
    expect((await rs.forestLoss(geom('X02', 1))).lossPct).toBe(10.5);
  });

  it('P09 harvest window → { mean: null, clearObservations: 0 }', async () => {
    expect(await rs.ndviWindow(geom('P09', 1.8), '2026-12-08', 30)).toEqual({ mean: null, clearObservations: 0, source: 'fixture' });
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

  it('matches a plot by geometry hash when its ID is not a fixture plot, then falls back', async () => {
    const byHash = createFixtureProvider({ profiles: PROFILES, byGeometryHash: { 'hash-x02': PROFILES.X02! } });
    expect((await byHash.forestLoss(geom('PL-ABCDEFGH', 1, 'hash-x02'))).lossPct).toBe(10.5);
    await expect(byHash.forestLoss(geom('PL-ABCDEFGH', 1, 'other'))).rejects.toThrow(/PL-ABCDEFGH/);
    const withFallback = createFixtureProvider({ profiles: PROFILES, fallback: PROFILES.P09! });
    expect(await withFallback.ndviWindow(geom('PL-ABCDEFGH', 1, 'other'), '2026-12-08', 30)).toEqual({ mean: null, clearObservations: 0, source: 'fixture' });
  });

  it('a profile named like an Object.prototype member is not found by accident', async () => {
    await expect(rs.forestLoss(geom('constructor', 1))).rejects.toThrow(/constructor/);
  });
});

describe('committed fixture set (TSK-07.1 profiles from the dataset)', () => {
  const ROOT = join(__dirname, '..', '..', '..', 'evals', 'fixtures');

  it('P01, X01, X05, X06 and P09 answer the TSK-07.1 numbers', async () => {
    const set = await loadFixtureSet(ROOT);
    const rs = createFixtureProvider(set);
    const nums = async (id: string, areaHa: number) => {
      const loss = await rs.forestLoss(geom(id, areaHa));
      const { months } = await rs.ndviHistory(geom(id, areaHa), '2026-12');
      const clear = months.flatMap((m) => (m.mean === null ? [] : [m.mean]));
      const window = await rs.ndviWindow(geom(id, areaHa), '2026-12-08', 30);
      return { lossPct: loss.lossPct, lossHa: loss.lossHa, min: Math.min(...clear), max: Math.max(...clear), clearMonths: clear.length, window };
    };
    expect(await nums('P01', 2)).toEqual({ lossPct: 0, lossHa: 0, min: 0.62, max: 0.81, clearMonths: 11, window: { mean: 0.71, clearObservations: 4, source: 'fixture' } });
    expect(await nums('X01', 2)).toEqual({ lossPct: 25, lossHa: 0.5, min: 0.21, max: 0.58, clearMonths: 11, window: { mean: 0.71, clearObservations: 4, source: 'fixture' } });
    expect(await nums('X05', 1.2)).toEqual({ lossPct: 0, lossHa: 0, min: 0.28, max: 0.74, clearMonths: 11, window: { mean: 0.71, clearObservations: 4, source: 'fixture' } });
    expect(await nums('X06', 2)).toEqual({ lossPct: 40, lossHa: 0.8, min: 0.21, max: 0.58, clearMonths: 11, window: { mean: 0.22, clearObservations: 3, source: 'fixture' } });
    expect(await nums('P09', 1.8)).toEqual({ lossPct: 0, lossHa: 0, min: 0.62, max: 0.81, clearMonths: 11, window: { mean: null, clearObservations: 0, source: 'fixture' } });
  });

  it('indexes dataset plots and the P01-edited-18pct geometry by geometry hash', async () => {
    const { geometryHash } = await import('../geo/area');
    const { readFileSync } = await import('node:fs');
    const set = await loadFixtureSet(ROOT);
    const p01 = (JSON.parse(readFileSync(join(ROOT, 'plots', 'P01.geojson'), 'utf8')) as { geometry: PlotGeom['polygon'] }).geometry;
    const edited = (JSON.parse(readFileSync(join(ROOT, 'geometry', 'P01-edited-18pct.geojson'), 'utf8')) as { features: { geometry: PlotGeom['polygon'] }[] }).features[0]!.geometry;
    expect(set.byGeometryHash[await geometryHash(p01)]?.plotId).toBe('P01');
    expect(set.byGeometryHash[await geometryHash(edited)]?.forestLoss).toMatchObject({ lossPct: 18 });
  });
});

describe('FixtureProvider fault injection', () => {
  it("http_500 on gfw rejects with ProviderError('gfw', 500) and leaves sentinel-hub alone", async () => {
    const rs = new FixtureProvider({ profiles: PROFILES, faults: [{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }] });
    const err = await rs.forestLoss(geom('P01', 2)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ provider: 'gfw', kind: 'http', status: 500 });
    expect(err).toEqual(new ProviderError('gfw', 500));
    expect(await rs.ndviWindow(geom('P01', 2), '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4, source: 'fixture' });
    expect((await rs.ndviHistory(geom('P01', 2), '2026-12')).months).toHaveLength(12);
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

  it('a gfw timeout leaves sentinel-hub answering', async () => {
    const rs = createFixtureProvider({ profiles: PROFILES, faults: [{ provider: 'gfw', mode: 'timeout' }] });
    expect(await rs.ndviWindow(geom('P01', 2), '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4, source: 'fixture' });
  });

  it('exposes the injected faults (cacheEmpty is recorded for the cache wrapper)', () => {
    const faults = [{ provider: 'gfw', mode: 'http_500', cacheEmpty: true }] as const;
    expect(new FixtureProvider({ profiles: PROFILES, faults: [...faults] }).faults).toEqual(faults);
  });
});

describe('FixtureProvider delayMs', () => {
  it('answers ndviWindow only after its delay; other calls are immediate', async () => {
    vi.useFakeTimers();
    const rs = createFixtureProvider({ profiles: PROFILES, delayMs: { ndviWindow: 12_000 } });
    let answer: unknown;
    void rs.ndviWindow(geom('P01', 2), '2026-12-08', 30).then((a) => (answer = a));
    expect(await rs.forestLoss(geom('P01', 2))).toMatchObject({ lossPct: 0 });
    await vi.advanceTimersByTimeAsync(11_999);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toEqual({ mean: 0.71, clearObservations: 4, source: 'fixture' });
  });

  it('a delayed call rejects with timeout when the caller aborts first', async () => {
    const rs = createFixtureProvider({ profiles: PROFILES, delayMs: { forestLoss: 60_000 } });
    const ctl = new AbortController();
    const p = rs.forestLoss(geom('P01', 2), { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toEqual(new ProviderError('gfw', 'timeout'));
  });
});

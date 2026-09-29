import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlotPolygon, Polygon } from '../geo/types';
import { createLiveProvider, createProviderHealth, getRemoteSensing, plotGeom, providerHealth } from './index';

// TSK-07.2: getRemoteSensing(env) picks the provider REMOTE_SENSING_PROVIDER names. In fixture mode the
// app answers from the committed fixture set: a dataset plot's geometry by its geometry hash, the
// P01-edited-18pct geometry (TC-028), and any other plot with the honest P01 profile.

const FIXTURES = join(__dirname, '..', '..', '..', 'evals', 'fixtures');
const geometry = (file: string): PlotPolygon => {
  const doc = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { type: string; geometry?: PlotPolygon; features?: { geometry: PlotPolygon }[] };
  return doc.type === 'FeatureCollection' ? doc.features![0]!.geometry : doc.geometry!;
};
const FIXTURE_ENV = { REMOTE_SENSING_PROVIDER: 'fixture', PUBLIC_BASE_URL: 'http://localhost:3000' } as const;

describe('getRemoteSensing (fixture mode)', () => {
  const rs = getRemoteSensing(FIXTURE_ENV);

  it('is the fixture provider', () => {
    expect(rs.name).toBe('fixture');
  });

  it('answers an app plot with a dataset geometry from that plot’s profile (X02 → 10.5 %)', async () => {
    const g = await plotGeom({ id: 'PL-7K2M9Q4D', polygon: geometry('plots/X02.geojson'), areaHa: 1 });
    expect((await rs.forestLoss(g)).lossPct).toBe(10.5);
  });

  it('answers the P01-edited-18pct geometry with 18.0 % loss', async () => {
    const g = await plotGeom({ id: 'PL-7K2M9Q4D', polygon: geometry('geometry/P01-edited-18pct.geojson'), areaHa: 2.9 });
    expect((await rs.forestLoss(g)).lossPct).toBe(18);
  });

  it('answers any other plot with the honest P01 profile', async () => {
    const g = await plotGeom({ id: 'PL-7K2M9Q4D', polygon: geometry('geometry/valid-polygon.geojson'), areaHa: 1.3 });
    expect(await rs.forestLoss(g)).toEqual({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025 });
    expect(await rs.ndviWindow(g, '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4 });
  });
});

describe('plotGeom', () => {
  it('carries the geometry hash that keys the cache', async () => {
    const polygon = geometry('plots/P01.geojson');
    const g = await plotGeom({ id: 'P01', polygon, areaHa: 2 });
    expect(g).toMatchObject({ id: 'P01', polygon, areaHa: 2 });
    expect(g.geometryHash).toMatch(/^[0-9a-f]{64}$/);
    const ring = (polygon as Polygon).coordinates[0]!;
    const moved: Polygon = { type: 'Polygon', coordinates: [[[ring[0]![0]! + 1e-6, ring[0]![1]!], ...ring.slice(1, -1), [ring[0]![0]! + 1e-6, ring[0]![1]!]]] };
    expect((await plotGeom({ id: 'P01', polygon: moved, areaHa: 2 })).geometryHash).not.toBe(g.geometryHash);
  });
});

describe('createLiveProvider (live mode)', () => {
  const KEYS = { GFW_API_KEY: 'gfw-test-key-kkkk', CDSE_CLIENT_ID: 'cdse-test-client', CDSE_CLIENT_SECRET: 'cdse-test-secret-ssss' };
  const LIVE_ENV = { REMOTE_SENSING_PROVIDER: 'live', PUBLIC_BASE_URL: 'https://udgam.example', ...KEYS } as const;

  it('names the missing variables, never their values', () => {
    let message = '';
    try {
      createLiveProvider({ ...LIVE_ENV, CDSE_CLIENT_SECRET: undefined, GFW_API_KEY: undefined });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('REMOTE_SENSING_PROVIDER=live needs GFW_API_KEY, CDSE_CLIENT_SECRET');
    expect(message).not.toContain(KEYS.CDSE_CLIENT_ID);
  });

  it('sends forest loss to GFW (origin = PUBLIC_BASE_URL) and NDVI to Sentinel Hub, and probes both', async () => {
    const calls: string[] = [];
    const origins: string[] = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (String(url).includes('/token')) return Response.json({ access_token: 'tok', expires_in: 600 });
      if (String(url).includes('/statistics')) return Response.json({ status: 'OK', data: [] });
      if (String(url).endsWith('/query/json')) {
        origins.push((init?.headers as Record<string, string>).origin!);
        return Response.json({ status: 'success', data: [] });
      }
      return Response.json({ data: {} });
    }) as typeof globalThis.fetch;
    const live = createLiveProvider(LIVE_ENV, { fetch });
    expect(live.name).toBe('live');
    const g = await plotGeom({ id: 'PL-7K2M9Q4D', polygon: geometry('plots/P01.geojson'), areaHa: 2 });
    expect((await live.forestLoss(g)).lossPct).toBe(0);
    expect(await live.ndviWindow(g, '2026-12-08', 30)).toEqual({ mean: null, clearObservations: 0 });
    expect(await live.probe()).toEqual({ gfw: 'ok', sentinelHub: 'ok' });
    expect(origins).toEqual(['https://udgam.example']);
    expect(calls).toEqual([
      'POST https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss/v1.13/query/json',
      'POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      'POST https://sh.dataspace.copernicus.eu/statistics/v1',
      'GET https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss',
    ]);
  });

  it('a failing probe reports error for that provider only', async () => {
    const fetch = (async (url: string | URL | Request) =>
      String(url).includes('/token') ? Response.json({ access_token: 'tok', expires_in: 600 }) : new Response('{}', { status: 403 })) as typeof globalThis.fetch;
    expect(await createLiveProvider(LIVE_ENV, { fetch }).probe()).toEqual({ gfw: 'error', sentinelHub: 'ok' });
  });
});

describe('provider health (TC-001, §15)', () => {
  it('fixture mode reports fixture for both providers without probing', async () => {
    expect(await providerHealth({ REMOTE_SENSING_PROVIDER: 'fixture', PUBLIC_BASE_URL: 'http://localhost:3000' })).toEqual({ gfw: 'fixture', sentinelHub: 'fixture' });
  });

  it('live mode probes at most once per 60 s and reuses the answer in between', async () => {
    let t = 1_000_000;
    let probes = 0;
    const answers = [{ gfw: 'ok', sentinelHub: 'ok' }, { gfw: 'error', sentinelHub: 'ok' }] as const;
    const health = createProviderHealth(async () => answers[probes++]!, { now: () => t });
    expect(await health()).toEqual({ gfw: 'ok', sentinelHub: 'ok' });
    t += 59_999;
    expect(await health()).toEqual({ gfw: 'ok', sentinelHub: 'ok' });
    expect(probes).toBe(1);
    t += 1;
    expect(await health()).toEqual({ gfw: 'error', sentinelHub: 'ok' });
    expect(probes).toBe(2);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlotPolygon, Polygon } from '../geo/types';
import { getRemoteSensing, plotGeom } from './index';

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

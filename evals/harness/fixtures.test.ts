import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { area, bbox, booleanPointInPolygon, centroid, kinks, polygon as turfPolygon } from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { loadDataset } from './dataset';
import { PLOTS_DIR, RS_DIR, generatePlotFixtures, generateRemoteSensingFixtures, remoteSensingProfile } from './fixtures';

// TSK-03.2: deterministic plot polygons near real Kodagu/Chikkamagaluru anchor points, sized to the
// dataset's area_ha, and remote-sensing profiles from the dataset's remote_sensing block.

const ds = loadDataset();
const plots = generatePlotFixtures(ds);
const byId = new Map(plots.map((p) => [p.feature.properties.id, p]));

describe('generatePlotFixtures', () => {
  it('makes one fixture for every dataset plot: P01–P10, E01, X01–X10', () => {
    expect([...byId.keys()].sort()).toEqual(ds.fixtures.plots.map((p) => p.id).sort());
    expect(byId.size).toBe(21); // dataset 0.4.0 added X08–X10 (TKT-07)
  });

  it.each(ds.fixtures.plots.map((p) => [p.id, p.area_ha] as const))('%s area is within 0.5 %% of %s ha', (id, ha) => {
    const f = byId.get(id)!.feature;
    const m2 = area(f.geometry);
    expect(Math.abs(m2 / 10_000 - ha) / ha).toBeLessThan(0.005);
  });

  it('P10 is 4.0 ha (± 0.5 %)', () => {
    expect(area(byId.get('P10')!.feature.geometry) / 10_000).toBeGreaterThan(3.98);
    expect(area(byId.get('P10')!.feature.geometry) / 10_000).toBeLessThan(4.02);
  });

  it('P04 is an L: the notch centroid is outside the polygon but inside its bounding box', () => {
    const f = byId.get('P04')!.feature;
    expect(f.properties.shape).toBe('concave_L');
    const notch = f.properties.notch!;
    const c = centroid(turfPolygon(notch.coordinates));
    const [minX, minY, maxX, maxY] = bbox(f.geometry);
    const [x, y] = c.geometry.coordinates as [number, number];
    expect(booleanPointInPolygon(c, f.geometry)).toBe(false);
    expect(x > minX && x < maxX && y > minY && y < maxY).toBe(true);
  });

  it('every polygon is a closed, counter-clockwise, simple ring near Kodagu/Chikkamagaluru', () => {
    for (const { feature } of plots) {
      const ring = feature.geometry.coordinates[0]!;
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      let twice = 0;
      for (let i = 0; i < ring.length - 1; i++) twice += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
      expect(twice).toBeGreaterThan(0); // RFC 7946: exterior rings are counter-clockwise
      expect(kinks(feature.geometry).features).toHaveLength(0);
      for (const [lng, lat] of ring as [number, number][]) {
        expect(lat).toBeGreaterThan(12.0);
        expect(lat).toBeLessThan(13.7);
        expect(lng).toBeGreaterThan(75.2);
        expect(lng).toBeLessThan(76.2);
      }
    }
  });

  it('regeneration is byte-identical to the committed files', () => {
    for (const p of generatePlotFixtures(ds)) {
      expect(readFileSync(join(PLOTS_DIR, `${p.feature.properties.id}.geojson`), 'utf8')).toBe(p.text);
    }
    for (const r of generateRemoteSensingFixtures(ds)) {
      expect(readFileSync(join(RS_DIR, `${r.profile.plotId}.json`), 'utf8')).toBe(r.text);
    }
  });
});

describe('remoteSensingProfile', () => {
  it('P01: no loss, perennial canopy 0.62–0.81 over 11 clear months, living canopy 0.71 over 4 observations', () => {
    const p = remoteSensingProfile(ds, 'P01');
    expect(p.forestLoss).toMatchObject({ lossPct: 0, lossHa: 0, yearsFrom: 2021 });
    const clear = p.ndviHistory.byCalendarMonth.filter((m) => m.mean !== null);
    expect(p.ndviHistory.byCalendarMonth).toHaveLength(12);
    expect(clear).toHaveLength(11);
    expect(Math.min(...clear.map((m) => m.mean!))).toBe(0.62);
    expect(Math.max(...clear.map((m) => m.mean!))).toBe(0.81);
    expect(p.ndviWindow).toEqual({ profile: 'living_canopy', mean: 0.71, clearObservations: 4 });
  });

  it('X02: 10.5 % loss on 1.0 ha is 0.105 ha', () => {
    expect(remoteSensingProfile(ds, 'X02').forestLoss).toMatchObject({ lossPct: 10.5, lossHa: 0.105 });
  });

  it('P09: the harvest window is cloud-blocked (no clear observation)', () => {
    expect(remoteSensingProfile(ds, 'P09').ndviWindow).toEqual({ profile: 'cloud_blocked', mean: null, clearObservations: 0 });
  });

  it('X05 annual crop spans 0.28–0.74; X01 cleared-then-planted dips to 0.21; X06 bare window 0.22', () => {
    const range = (id: string) => {
      const v = remoteSensingProfile(ds, id).ndviHistory.byCalendarMonth.flatMap((m) => (m.mean === null ? [] : [m.mean]));
      return [Math.min(...v), Math.max(...v)];
    };
    expect(range('X05')).toEqual([0.28, 0.74]);
    expect(range('X01')[0]).toBe(0.21);
    expect(remoteSensingProfile(ds, 'X06').ndviWindow).toEqual({ profile: 'bare', mean: 0.22, clearObservations: 3 });
  });

  it('an unknown plot throws', () => {
    expect(() => remoteSensingProfile(ds, 'P99')).toThrow(/P99/);
  });
});

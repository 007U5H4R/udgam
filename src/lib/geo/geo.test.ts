import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaHa, formatHa, geometryHash } from './area';
import type { PlotPolygon } from './types';
import { validatePolygon } from './validate';

// TSK-06.2 / TC-027: EU geometry rules (self-intersection via @turf/kinks), geodesic area, the geometry
// hash that keys the remote-sensing cache (§4.1, EVAL-044).

const ROOT = join(__dirname, '..', '..', '..', 'evals', 'fixtures');
const feature = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as { geometry: PlotPolygon; properties: Record<string, unknown> };

const SQUARE: PlotPolygon = {
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

describe('validatePolygon', () => {
  it('a bow-tie → self_intersection', () => {
    expect(validatePolygon(feature('geometry/bowtie.geojson').geometry)).toBe('self_intersection');
  });

  it('a valid square → null', () => {
    expect(validatePolygon(SQUARE)).toBeNull();
  });

  it('the concave P04 fixture (notch outside the L) is a valid plot geometry (EVAL-005/026)', () => {
    const p04 = feature('plots/P04.geojson');
    expect(p04.properties.shape).toBe('concave_L');
    expect(validatePolygon(p04.geometry)).toBeNull();
  });

  it.each(['P01', 'P10'])('fixture %s is valid', (id) => {
    expect(validatePolygon(feature(`plots/${id}.geojson`).geometry)).toBeNull();
  });

  it('a MultiPolygon whose part crosses itself → self_intersection', () => {
    const bow = feature('geometry/bowtie.geojson').geometry;
    const multi: PlotPolygon = { type: 'MultiPolygon', coordinates: [SQUARE.coordinates as number[][][], bow.coordinates as number[][][]] };
    expect(validatePolygon(multi)).toBe('self_intersection');
  });
});

const ring = (...pts: [number, number][]) => [...pts, pts[0]!];

describe('validatePolygon — fix round 1 (nested parts, degenerate rings, plausibility)', () => {
  it('a MultiPolygon part lying wholly inside another part (a hole written as parts) → has_holes', () => {
    const outer = ring([75.74, 12.42], [75.742, 12.42], [75.742, 12.422], [75.74, 12.422]);
    const inner = ring([75.7405, 12.4205], [75.7415, 12.4205], [75.7415, 12.4215], [75.7405, 12.4215]);
    expect(validatePolygon({ type: 'MultiPolygon', coordinates: [[outer], [inner]] })).toBe('has_holes');
    expect(validatePolygon({ type: 'MultiPolygon', coordinates: [[inner], [outer]] })).toBe('has_holes');
  });

  it('two separate parts are fine; parts touching at a corner are refused by kinks (self_intersection)', () => {
    const a = ring([75.74, 12.42], [75.741, 12.42], [75.741, 12.421], [75.74, 12.421]);
    const b = ring([75.742, 12.42], [75.743, 12.42], [75.743, 12.421], [75.742, 12.421]);
    const touching = ring([75.741, 12.421], [75.7415, 12.421], [75.7415, 12.4215], [75.741, 12.4215]);
    expect(validatePolygon({ type: 'MultiPolygon', coordinates: [[a], [b]] })).toBeNull();
    expect(validatePolygon({ type: 'MultiPolygon', coordinates: [[a], [touching]] })).toBe('self_intersection');
  });

  it('a collinear (zero-area) ring → degenerate', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([75.74, 12.42], [75.741, 12.42], [75.742, 12.42])] })).toBe('degenerate');
  });

  it('a sliver under 1 m² → degenerate', () => {
    // 0.5 m wide (4.5e-6°) and ~0.1 m tall: about 0.05 m²
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([75.74, 12.42], [75.740005, 12.42], [75.740005, 12.420001], [75.74, 12.420001])] })).toBe('degenerate');
  });

  it('latitude and longitude swapped (Kodagu at 75.7°N, 12.4°E) → out_of_region', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([12.42, 75.74], [12.421, 75.74], [12.421, 75.741], [12.42, 75.741])] })).toBe('out_of_region');
  });

  it('a ring across the antimeridian → out_of_region', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([179.9, 12.42], [-179.9, 12.42], [-179.9, 12.43], [179.9, 12.43])] })).toBe('out_of_region');
  });

  it('a ring spanning more than 1° in either axis → out_of_region', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([75.0, 12.42], [76.2, 12.42], [76.2, 12.43], [75.0, 12.43])] })).toBe('out_of_region');
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([75.74, 12.0], [75.75, 12.0], [75.75, 13.1], [75.74, 13.1])] })).toBe('out_of_region');
  });

  it('coordinates beyond ±180/±90 stay not_wgs84 (checked before the region)', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [ring([580100, 1373400], [580230, 1373400], [580230, 1373510])] })).toBe('not_wgs84');
  });
});

describe('areaHa (TC-027: within 0.5 % of the stated area)', () => {
  it.each([
    ['P01', 2.0],
    ['P04', 1.2],
    ['P10', 4.0],
  ] as const)('%s ≈ %s ha', (id, stated) => {
    const ha = areaHa(feature(`plots/${id}.geojson`).geometry);
    expect(Math.abs(ha - stated) / stated).toBeLessThan(0.005);
  });

  it('is not rounded', () => {
    const ha = areaHa(SQUARE);
    expect(ha).not.toBe(Math.round(ha * 100) / 100);
  });
});

describe('formatHa', () => {
  it('shows two decimals and the unit', () => {
    expect(formatHa(2)).toBe('2.00 ha');
    expect(formatHa(1.19876)).toBe('1.20 ha');
    expect(formatHa(0.004)).toBe('0.00 ha');
  });
});

describe('geometryHash (the cache key, §4.1)', () => {
  it('golden value: sha256 of the RFC 8785 form of SQUARE (computed outside the code under test)', async () => {
    // printf '%s' '{"coordinates":[[[75.74,12.42],[75.741,12.42],[75.741,12.421],[75.74,12.421],[75.74,12.42]]],"type":"Polygon"}' | sha256sum
    expect(await geometryHash(SQUARE)).toBe('7b23d7c0394e79ba80fd402896ee823ec20df506e1c65956f1480f247ca3fb2f');
  });

  it('is 64 lowercase hex and stable across key order', async () => {
    const a = await geometryHash(SQUARE);
    const reordered = JSON.parse(`{"coordinates":${JSON.stringify(SQUARE.coordinates)},"type":"Polygon"}`) as PlotPolygon;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await geometryHash(reordered)).toBe(a);
  });

  it('changes when one vertex moves by 1e-6 degrees', async () => {
    const moved = structuredClone(SQUARE);
    (moved.coordinates as number[][][])[0]![2]![0] = 75.741001;
    expect(await geometryHash(moved)).not.toBe(await geometryHash(SQUARE));
  });
});

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

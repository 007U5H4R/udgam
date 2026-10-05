import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geo/types';
import { fitLabel, MAP_BOX, originMapPaths } from './map';

// TSK-16.4: the origin map draws every plot in one shared fit, one path per plot, inside the view box.
const square = (lng: number, lat: number, size = 0.001): Polygon => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
});

describe('originMapPaths (TSK-16.4)', () => {
  it('one closed path per plot, all inside the view box, in the input order', () => {
    const out = originMapPaths([
      { plotId: 'PL-A', polygon: square(75.739, 12.421) },
      { plotId: 'PL-B', polygon: square(75.742, 12.422) },
    ]);
    expect(out.map((p) => p.plotId)).toEqual(['PL-A', 'PL-B']);
    for (const p of out) {
      expect(p.d).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3} Z$/);
      const nums = p.d.match(/[\d.]+/g)!.map(Number);
      for (const [i, n] of nums.entries()) expect(n).toBeLessThanOrEqual(i % 2 === 0 ? MAP_BOX.w : MAP_BOX.h);
    }
  });

  it('shares one fit: the western plot is left of the eastern one, and the same size', () => {
    const [a, b] = originMapPaths([
      { plotId: 'PL-A', polygon: square(75.739, 12.421) },
      { plotId: 'PL-B', polygon: square(75.742, 12.421) },
    ]);
    expect(a!.label.x).toBeLessThan(b!.label.x);
    expect(a!.label.y).toBe(b!.label.y);
    const width = (d: string) => {
      const xs = d.match(/[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(a!.d)).toBeCloseTo(width(b!.d), 0);
  });

  it('a MultiPolygon plot keeps all of its rings; no plots draw nothing', () => {
    const multi = { type: 'MultiPolygon' as const, coordinates: [square(75.739, 12.421).coordinates, square(75.745, 12.421).coordinates] };
    const [m, s] = originMapPaths([
      { plotId: 'PL-M', polygon: multi },
      { plotId: 'PL-S', polygon: square(75.742, 12.425) },
    ]);
    expect(m!.d.match(/M/g)).toHaveLength(2);
    expect(s!.d.match(/M/g)).toHaveLength(1);
    expect(originMapPaths([])).toEqual([]);
  });
});

describe('plot labels stay inside their outlines (TASK-17 fix round 1)', () => {
  it('each label point carries its plot box, in view units', () => {
    const [a] = originMapPaths([
      { plotId: 'PL-A', polygon: square(75.739, 12.421) },
      { plotId: 'PL-B', polygon: square(75.749, 12.421) },
    ]);
    expect(a!.label.w).toBeGreaterThan(0);
    expect(a!.label.h).toBeGreaterThan(0);
    expect(a!.label.w).toBeLessThan(MAP_BOX.w / 2);
  });

  it('fits a label at its natural width, squeezes it down to 60 %, or leaves it out', () => {
    // 11 characters at 26 px take about 11 × 0.62 × 26 = 177.3 view units
    expect(fitLabel('PR-7K2M9Q4D', 26, 200)).toEqual({});
    expect(fitLabel('PR-7K2M9Q4D', 26, 120)).toEqual({ textLength: 120 });
    expect(fitLabel('PR-7K2M9Q4D', 26, 100)).toBeNull();
  });
});

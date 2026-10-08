import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geo/types';
import { BADGE_R, fitLabel, MAP_BOX, MIN_MARK, originMapPaths, plotMarks, RING_R } from './map';

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

// DES-200 (Stage 8): plots far apart are drawn tiny by the shared fit (the demo batch drew 10 × 9 and 4 × 5
// px) and a real producer ID never fit, so no plot was labelled. Each plot now gets a ring marker when it is
// drawn under MIN_MARK view units, and a number badge (shared with its farm row) when its ID does not fit.
describe('plot marks: minimum drawn size and labels that fit (DES-200)', () => {
  const far = [
    { plotId: 'PL-A', polygon: square(75.739, 12.421, 0.0001) },
    { plotId: 'PL-B', polygon: square(75.789, 12.461, 0.0001) },
  ];
  const named = [
    { plotId: 'PL-A', producerId: 'PR-DWDGB4HE', area: '2.0 ha' },
    { plotId: 'PL-B', producerId: 'PR-7K2M9Q4D', area: '1.2 ha' },
  ];

  it('tiny plots get a 36-unit ring and a numbered badge beside the plot, inside the view box', () => {
    const paths = originMapPaths(far);
    expect(Math.max(paths[0]!.label.w, paths[0]!.label.h)).toBeLessThan(MIN_MARK);
    const marks = plotMarks(paths, named);
    expect(marks.map((m) => m.n)).toEqual([1, 2]);
    expect(RING_R * 2).toBe(36);
    for (const [i, m] of marks.entries()) {
      const p = paths[i]!.label;
      expect(m.ring).toEqual({ x: p.x, y: p.y, r: RING_R });
      expect(m.label.kind).toBe('badge');
      // beside the ring, not over the plot
      expect(Math.abs(m.label.y - p.y)).toBeGreaterThanOrEqual(RING_R + BADGE_R);
      expect(m.label.x).toBeGreaterThanOrEqual(BADGE_R);
      expect(m.label.x).toBeLessThanOrEqual(MAP_BOX.w - BADGE_R);
      expect(m.label.y).toBeGreaterThanOrEqual(BADGE_R);
      expect(m.label.y).toBeLessThanOrEqual(MAP_BOX.h - BADGE_R);
    }
  });

  it('a plot big enough for its ID keeps the verify.html label (ID and area inside the outline), no ring', () => {
    const paths = originMapPaths([{ plotId: 'PL-A', polygon: square(75.739, 12.421, 0.01) }]);
    const [m] = plotMarks(paths, [{ plotId: 'PL-A', producerId: 'F-0231', area: '1.8 ha' }]);
    expect(m!.ring).toBeNull();
    expect(m!.label).toEqual({ kind: 'full', x: paths[0]!.label.x, y: paths[0]!.label.y, main: {}, sub: {} });
  });

  it('a plot too narrow for an 11-character ID but wider than a badge gets the badge at its centre', () => {
    // four plots side by side: each about 100 units wide, under the 60 % squeeze floor of a 177-unit ID
    const plots = [0, 1, 2, 3].map((i) => ({ plotId: `PL-${i}`, polygon: square(75.739 + i * 0.0011, 12.421, 0.001) }));
    const paths = originMapPaths(plots);
    const marks = plotMarks(
      paths,
      plots.map((p) => ({ plotId: p.plotId, producerId: 'PR-DWDGB4HE', area: '2.0 ha' })),
    );
    for (const [i, m] of marks.entries()) {
      expect(m.ring).toBeNull();
      expect(m.label).toEqual({ kind: 'badge', x: paths[i]!.label.x, y: paths[i]!.label.y });
    }
  });

  it('a badge with no room above a plot at the top edge goes below it', () => {
    const paths = [{ plotId: 'PL-T', d: 'M300 10 L304 10 L304 14 L300 14 Z', label: { x: 302, y: 12, w: 4, h: 4 } }];
    const [m] = plotMarks(paths, [{ plotId: 'PL-T', producerId: 'PR-DWDGB4HE', area: '2.0 ha' }]);
    expect(m!.label.kind).toBe('badge');
    expect(m!.label.y).toBeGreaterThan(12 + RING_R);
  });
});

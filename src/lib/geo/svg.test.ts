import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plotPathD, projectToBox } from './svg';
import type { Polygon } from './types';

// The plot outline for PlotSvg: fitted into the view box with its margin, north up, closed with Z.

describe('plotPathD', () => {
  it('fits a square plot into the view box, centred, north up', () => {
    const d = plotPathD(
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      { width: 100, height: 60, pad: 10 },
    );
    // 40 × 40 square centred in 100 × 60: x 30..70, y 10..50; latitude 0 is the bottom edge.
    expect(d).toBe('M30 50 L70 50 L70 10 L30 10 Z');
  });

  it('draws each part of a MultiPolygon', () => {
    const part = (x: number) => [
      [
        [x, 0],
        [x + 1, 0],
        [x + 1, 1],
        [x, 0],
      ],
    ];
    const d = plotPathD({ type: 'MultiPolygon', coordinates: [part(0), part(2)] });
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('an empty geometry draws nothing', () => {
    expect(plotPathD({ type: 'Polygon', coordinates: [] })).toBe('');
  });
});

// TSK-10.3: projectToBox for the Home plot card (PlotSvg): equirectangular with cos(lat) x-scaling,
// y flipped, fitted into the box minus padding with the aspect kept; the live dot and whether it is
// inside (lib/geo/geofence, the one point-in-polygon).

const fixture = (id: string) => JSON.parse(readFileSync(`evals/fixtures/plots/${id}.geojson`, 'utf8')) as { geometry: Polygon; properties: { notch?: Polygon } };

/** The x/y extremes of an `M x y L x y … Z` path. */
function extent(path: string) {
  const nums = [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  const xs = nums.map((n) => n[0]);
  const ys = nums.map((n) => n[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), vertices: nums.length };
}

describe('projectToBox', () => {
  // A 100 m × 100 m square near Madikeri (12.42° N): 100 m of latitude is 100 / 111 320 degrees, and
  // 100 m of longitude is that divided by cos(12.42°).
  const lat0 = 12.42;
  const dLat = 100 / 111_320;
  const dLng = dLat / Math.cos((lat0 * Math.PI) / 180);
  const square: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [75.74, lat0],
        [75.74 + dLng, lat0],
        [75.74 + dLng, lat0 + dLat],
        [75.74, lat0 + dLat],
        [75.74, lat0],
      ],
    ],
  };

  it('fits a 100 m square into a 200 × 120 box minus the padding, centred, aspect kept', () => {
    const { path } = projectToBox(square, { w: 200, h: 120, pad: 10 });
    const e = extent(path);
    // 180 × 100 available: the square is limited by the height, so it is 100 × 100 at x 50–150, y 10–110.
    expect(e.minX).toBeCloseTo(50, 0);
    expect(e.maxX).toBeCloseTo(150, 0);
    expect(e.minY).toBeCloseTo(10, 0);
    expect(e.maxY).toBeCloseTo(110, 0);
    expect(e.maxX - e.minX).toBeCloseTo(e.maxY - e.minY, 0);
  });

  it('draws the P04 L-shape with its 6 vertices', () => {
    const { path } = projectToBox(fixture('P04').geometry, { w: 360, h: 222, pad: 26 });
    expect(extent(path).vertices).toBe(6);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('a point in the P04 notch is outside, one in the body is inside, and both get a dot', () => {
    const p04 = fixture('P04');
    const notch = p04.properties.notch!.coordinates[0]!;
    const inNotch = { lng: (notch[0]![0]! + notch[2]![0]!) / 2, lat: (notch[0]![1]! + notch[2]![1]!) / 2 };
    const out = projectToBox(p04.geometry, { w: 360, h: 222, pad: 26 }, inNotch);
    expect(out.inside).toBe(false);
    expect(out.dot).toBeDefined();
    const inBody = { lng: 75.8046, lat: 12.196 };
    expect(projectToBox(p04.geometry, { w: 360, h: 222, pad: 26 }, inBody).inside).toBe(true);
  });

  it('puts the dot where the point is: the square centre lands in the box centre', () => {
    const { dot } = projectToBox(square, { w: 200, h: 120, pad: 10 }, { lat: lat0 + dLat / 2, lng: 75.74 + dLng / 2 });
    expect(dot!.x).toBeCloseTo(100, 0);
    expect(dot!.y).toBeCloseTo(60, 0);
  });

  it('is deterministic (snapshot)', () => {
    const a = projectToBox(fixture('P01').geometry, { w: 360, h: 222, pad: 26 }, { lat: 12.4211, lng: 75.7392 });
    expect(projectToBox(fixture('P01').geometry, { w: 360, h: 222, pad: 26 }, { lat: 12.4211, lng: 75.7392 })).toEqual(a);
    expect(a).toMatchSnapshot();
  });
});

import { describe, expect, it } from 'vitest';
import { distanceToEdgeM, haversineM } from './distance';
import { geofenceStatus, locate } from './geofence';
import type { MultiPolygon, Polygon } from './types';

// A ~2 ha rectangle near Madikeri with axis-aligned edges, so a point due north of the top edge's
// midpoint is exactly its meridian distance from the edge.
const LAT = 12.42;
const LNG = 75.74;
const DY = 0.00064;
const DX = 0.00065;
const RING = [
  [LNG - DX, LAT - DY],
  [LNG + DX, LAT - DY],
  [LNG + DX, LAT + DY],
  [LNG - DX, LAT + DY],
  [LNG - DX, LAT - DY],
];
const SQUARE: Polygon = { type: 'Polygon', coordinates: [RING] };
/** Mean-earth-radius metres per degree of latitude (R = 6 371 008.8 m). */
const M_PER_DEG = 111_195.08;
const northOfTop = (m: number) => ({ lat: LAT + DY + m / M_PER_DEG, lng: LNG });

describe('haversineM / distanceToEdgeM', () => {
  it('one degree of latitude is 111 195 m on the mean-radius sphere', () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195.08, 1);
  });

  it('measures to the nearest edge, inside or outside', () => {
    expect(distanceToEdgeM(northOfTop(2400), SQUARE)).toBeCloseTo(2400, 0);
    // From the centre the east/west edges are nearest: 0.00065° × 111 195.08 m × cos 12.42° = 70.59 m.
    expect(distanceToEdgeM({ lat: LAT, lng: LNG }, SQUARE)).toBeCloseTo(70.59, 1);
  });
});

describe('geofenceStatus (technical-plan §6.3)', () => {
  it('ok inside the polygon, with the distance to the edge', () => {
    const r = geofenceStatus({ lat: LAT, lng: LNG }, SQUARE, 8, 25);
    expect(r.status).toBe('ok');
    expect(Math.round(r.distanceM)).toBe(71);
  });

  it('flag when outside by no more than min(accuracy, 25 m) — EVAL-009: 12 m out at 20 m accuracy', () => {
    const r = geofenceStatus(northOfTop(12), SQUARE, 20, 25);
    expect(r).toMatchObject({ status: 'flag', bufferM: 20 });
    expect(Math.round(r.distanceM)).toBe(12);
  });

  it('fail beyond the buffer — EVAL-022: 2400 m out', () => {
    const r = geofenceStatus(northOfTop(2400), SQUARE, 8, 25);
    expect(r).toMatchObject({ status: 'fail', bufferM: 8 });
    expect(Math.round(r.distanceM)).toBe(2400);
  });

  it('caps the buffer at 25 m however poor the accuracy — EVAL-027: 26 m out at 60 m accuracy', () => {
    expect(geofenceStatus(northOfTop(26), SQUARE, 60, 25)).toMatchObject({ status: 'fail', bufferM: 25 });
    expect(geofenceStatus(northOfTop(24), SQUARE, 60, 25)).toMatchObject({ status: 'flag', bufferM: 25 });
  });

  it('uses the accuracy as the buffer when it is tighter — EVAL-025: 30 m out at 8 m accuracy', () => {
    expect(geofenceStatus(northOfTop(30), SQUARE, 8, 25)).toMatchObject({ status: 'fail', bufferM: 8 });
  });

  it('treats a hole as outside and handles multipolygons', () => {
    const hole = [
      [LNG - DX / 4, LAT - DY / 4],
      [LNG - DX / 4, LAT + DY / 4],
      [LNG + DX / 4, LAT + DY / 4],
      [LNG + DX / 4, LAT - DY / 4],
      [LNG - DX / 4, LAT - DY / 4],
    ];
    const withHole: Polygon = { type: 'Polygon', coordinates: [RING, hole] };
    expect(geofenceStatus({ lat: LAT, lng: LNG }, withHole, 5, 25).status).toBe('fail');
    const far = RING.map(([x, y]) => [x! + 0.01, y!]);
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [[far], [RING]] };
    expect(geofenceStatus({ lat: LAT, lng: LNG }, multi, 5, 25).status).toBe('ok');
  });
});

describe('locate (technical-plan §22 TSK-08.3)', () => {
  it('inside with the distance to the nearest edge segment, not to a vertex', () => {
    const r = locate({ lat: LAT, lng: LNG }, SQUARE);
    expect(r.inside).toBe(true);
    expect(r.distanceToEdgeM).toBeCloseTo(70.59, 1); // east/west edges; the nearest vertex is ~101 m away
  });

  it('outside with the distance to the edge', () => {
    const r = locate(northOfTop(12), SQUARE);
    expect(r.inside).toBe(false);
    expect(r.distanceToEdgeM).toBeCloseTo(12, 1);
  });

  it('a concave notch is outside although it is inside the bounding box', () => {
    // An L: the square minus its north-east quarter.
    const L: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [LNG - DX, LAT - DY],
          [LNG + DX, LAT - DY],
          [LNG + DX, LAT],
          [LNG, LAT],
          [LNG, LAT + DY],
          [LNG - DX, LAT + DY],
          [LNG - DX, LAT - DY],
        ],
      ],
    };
    const notch = { lat: LAT + DY / 2, lng: LNG + DX / 2 };
    expect(locate(notch, L).inside).toBe(false);
    expect(locate(notch, SQUARE).inside).toBe(true);
    expect(locate({ lat: LAT - DY / 2, lng: LNG + DX / 2 }, L).inside).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlotFile } from './parse';

// TSK-06.1 / TC-026: GeoJSON and KML uploads normalise to a WGS84 Polygon or MultiPolygon rounded to
// 6 dp, and every invalid input is refused with its exact reason.

const FIXTURES = join(__dirname, '..', '..', '..', 'evals', 'fixtures', 'geometry');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

const VALID_RING_6DP = [
  [75.740123, 12.421012],
  [75.741346, 12.420988],
  [75.741411, 12.422011],
  [75.7401, 12.422056],
  [75.740123, 12.421012],
];

describe('parsePlotFile — valid inputs (TC-026)', () => {
  it('a FeatureCollection with one Polygon unwraps to the Polygon, rounded to 6 dp', () => {
    expect(parsePlotFile('valid-polygon.geojson', fixture('valid-polygon.geojson'))).toEqual({
      ok: true,
      geometry: { type: 'Polygon', coordinates: [VALID_RING_6DP] },
    });
  });

  it('a bare MultiPolygon is accepted as a MultiPolygon', () => {
    const r = parsePlotFile('valid-multipolygon.geojson', fixture('valid-multipolygon.geojson'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geometry.type).toBe('MultiPolygon');
    expect(r.geometry.coordinates).toHaveLength(2);
  });

  it('a KML file with one placemark gives its Polygon (altitude dropped, rounded to 6 dp)', () => {
    expect(parsePlotFile('one-placemark.kml', fixture('one-placemark.kml'))).toEqual({
      ok: true,
      geometry: { type: 'Polygon', coordinates: [VALID_RING_6DP] },
    });
  });

  it('a single Feature and a bare Polygon geometry are accepted', () => {
    const polygon = { type: 'Polygon', coordinates: [VALID_RING_6DP] };
    expect(parsePlotFile('f.geojson', JSON.stringify({ type: 'Feature', properties: {}, geometry: polygon }))).toEqual({ ok: true, geometry: polygon });
    expect(parsePlotFile('g.json', JSON.stringify(polygon))).toEqual({ ok: true, geometry: polygon });
  });

  it('KML is recognised by its content even without a .kml name', () => {
    expect(parsePlotFile('upload', fixture('one-placemark.kml')).ok).toBe(true);
  });
});

describe('parsePlotFile — refused with a reason (TC-026)', () => {
  it.each([
    ['empty.geojson', 'empty'],
    ['open-ring.geojson', 'open_ring'],
    ['projected.geojson', 'not_wgs84'],
    ['too-many-vertices.geojson', 'too_many_vertices'],
  ] as const)('%s → %s', (name, reason) => {
    expect(parsePlotFile(name, fixture(name))).toEqual({ ok: false, reason });
  });

  it('an empty or blank file → empty', () => {
    expect(parsePlotFile('x.geojson', '')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePlotFile('x.kml', '  \n')).toEqual({ ok: false, reason: 'empty' });
  });

  it('a KML file with no placemark geometry → empty', () => {
    const kml = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document></Document></kml>';
    expect(parsePlotFile('x.kml', kml)).toEqual({ ok: false, reason: 'empty' });
  });

  it('a Point, a LineString or unreadable text → not_polygon', () => {
    const point = { type: 'Point', coordinates: [75.74, 12.42] };
    const line = { type: 'LineString', coordinates: [[75.74, 12.42], [75.75, 12.43]] };
    expect(parsePlotFile('p.geojson', JSON.stringify(point))).toEqual({ ok: false, reason: 'not_polygon' });
    expect(parsePlotFile('l.geojson', JSON.stringify({ type: 'Feature', properties: {}, geometry: line }))).toEqual({ ok: false, reason: 'not_polygon' });
    expect(parsePlotFile('x.geojson', '{ not json')).toEqual({ ok: false, reason: 'not_polygon' });
    expect(parsePlotFile('x.kml', '<kml><Document><Placemark><Point><coordinates>75.7,12.4</coordinates></Point></Placemark></Document></kml>')).toEqual({ ok: false, reason: 'not_polygon' });
  });

  it('more than one polygon feature is not one plot → not_polygon', () => {
    const polygon = { type: 'Polygon', coordinates: [VALID_RING_6DP] };
    const fc = { type: 'FeatureCollection', features: [1, 2].map(() => ({ type: 'Feature', properties: {}, geometry: polygon })) };
    expect(parsePlotFile('two.geojson', JSON.stringify(fc))).toEqual({ ok: false, reason: 'not_polygon' });
  });

  it('an inner ring → has_holes (the EU system ignores holes)', () => {
    const hole = [
      [75.7405, 12.4212],
      [75.7406, 12.4212],
      [75.7406, 12.4213],
      [75.7405, 12.4212],
    ];
    expect(parsePlotFile('h.geojson', JSON.stringify({ type: 'Polygon', coordinates: [VALID_RING_6DP, hole] }))).toEqual({ ok: false, reason: 'has_holes' });
  });

  it('a closed ring of three positions → too_few_positions', () => {
    const ring = [
      [75.74, 12.42],
      [75.741, 12.42],
      [75.74, 12.42],
    ];
    expect(parsePlotFile('t.geojson', JSON.stringify({ type: 'Polygon', coordinates: [ring] }))).toEqual({ ok: false, reason: 'too_few_positions' });
  });

  it('two positions that are the same after rounding to 6 dp → duplicate_vertices', () => {
    const ring = [
      [75.74, 12.42],
      [75.741, 12.42],
      [75.7410001, 12.4200002],
      [75.741, 12.421],
      [75.74, 12.42],
    ];
    expect(parsePlotFile('d.geojson', JSON.stringify({ type: 'Polygon', coordinates: [ring] }))).toEqual({ ok: false, reason: 'duplicate_vertices' });
  });

  it('a latitude beyond 90 → not_wgs84', () => {
    const ring = [
      [75.74, 12.42],
      [75.741, 95],
      [75.741, 12.421],
      [75.74, 12.42],
    ];
    expect(parsePlotFile('w.geojson', JSON.stringify({ type: 'Polygon', coordinates: [ring] }))).toEqual({ ok: false, reason: 'not_wgs84' });
  });
});

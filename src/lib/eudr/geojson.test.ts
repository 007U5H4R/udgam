import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { booleanPointInPolygon } from '@turf/turf';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { areaHa } from '../geo/area';
import type { Polygon } from '../geo/types';
import type { ProofFeedV1 } from '../ledger/proof';
import { buildEudrGeoJson, serializeEudrGeoJson, type EudrFeature } from './geojson';

// TSK-17.1 · TC-070 (builder half) · EVAL-078 · TP24: the EUDR geolocation file is built from the proof
// feed's payloads alone (TP16). The fixture feed (evals/fixtures/feeds/batch-3-events.json, three 2.0 ha
// plots) has its three plots' anchored polygons swapped for the harness fixtures P01 (2.0 ha), P10
// (4.0 ha) and P03 (5.5 ha), each with the area registration computes for it, so one batch exercises both
// sides of the 4 ha rule. Every expected value is a literal from TP24 or the fixture files.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'docs/eudr-geojson.schema.json'), 'utf8')) as object;
const BASE = 'https://udgam.test';

const fixture = (id: string): Polygon => (JSON.parse(readFileSync(join(ROOT, `evals/fixtures/plots/${id}.geojson`), 'utf8')) as { geometry: Polygon }).geometry;

/** The fixture feed's plots, in ledger order, with their producer IDs (read off the fixture file). */
const PLOTS = [
  { plotId: 'PL-QZE72CD2', producerId: 'PR-0PDMRFJ3' },
  { plotId: 'PL-ZCPHYB19', producerId: 'PR-VVEWARBA' },
  { plotId: 'PL-G7JGKSD0', producerId: 'PR-YQZGQHEX' },
] as const;

/** The fixture feed with plot i's anchored polygon (every plot_registered / plot_edited payload) replaced. */
function withPolygons(polys: Polygon[]): ProofFeedV1 {
  const f = structuredClone(FEED);
  for (const e of f.entries) {
    if (e.kind !== 'plot_registered' && e.kind !== 'plot_edited') continue;
    const i = PLOTS.findIndex((p) => p.plotId === e.payload.plotId);
    if (i < 0 || !polys[i]) continue;
    e.payload.polygon = polys[i];
    e.payload.areaHa = areaHa(polys[i]);
  }
  return f;
}

const MIXED = withPolygons([fixture('P01'), fixture('P10'), fixture('P03')]);
const byProducer = (fc: { features: EudrFeature[] }, producerId: string) => fc.features.find((f) => f.properties.ProducerName === producerId)!;

const TP24_KEYS = ['ProducerName', 'ProducerCountry', 'ProductionPlace', 'Area', 'commodity', 'hs_code', 'quantity_kg_cherry', 'crop', 'batch_id', 'certificate_url'];

/** Every position of a geometry. */
function positions(f: EudrFeature): number[][] {
  const g = f.geometry;
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'Polygon') return g.coordinates.flat();
  return g.coordinates.flat(2);
}
function rings(f: EudrFeature): number[][][] {
  const g = f.geometry;
  if (g.type === 'Point') return [];
  if (g.type === 'Polygon') return g.coordinates;
  return g.coordinates.flat();
}

describe('buildEudrGeoJson (TSK-17.1, TC-070, EVAL-078)', () => {
  it('a FeatureCollection with one Feature per plot of the batch', () => {
    const fc = buildEudrGeoJson(MIXED, BASE);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(3);
    expect(fc.features.every((f) => f.type === 'Feature')).toBe(true);
    expect(fc.features.map((f) => f.properties.ProducerName)).toEqual(['PR-0PDMRFJ3', 'PR-VVEWARBA', 'PR-YQZGQHEX']);
  });

  it('P01 (2.0 ha) is a Point inside the plot with Area 2.0 as a number; P10 (4.0 ha) and P03 (5.5 ha) are Polygons', () => {
    const fc = buildEudrGeoJson(MIXED, BASE);
    const p01 = byProducer(fc, 'PR-0PDMRFJ3');
    expect(p01.geometry.type).toBe('Point');
    expect(p01.properties.Area).toBe(2);
    expect(typeof p01.properties.Area).toBe('number');
    expect(booleanPointInPolygon(p01.geometry.coordinates as number[], fixture('P01'), { ignoreBoundary: true })).toBe(true);

    const p10 = byProducer(fc, 'PR-VVEWARBA');
    const p03 = byProducer(fc, 'PR-YQZGQHEX');
    expect(p10.geometry.type).toBe('Polygon'); // exactly 4 ha: Polygon (TP24 "4 ha or more")
    expect(p03.geometry.type).toBe('Polygon');
    // Area is a Point property only (EU file description: Area applies to Points)
    expect('Area' in p10.properties).toBe(false);
    expect('Area' in p03.properties).toBe(false);
  });

  it('a concave plot (P04, L-shaped, 1.2 ha) gets a Point strictly inside it, not on its edge', () => {
    const fc = buildEudrGeoJson(withPolygons([fixture('P04')]), BASE);
    const p04 = byProducer(fc, 'PR-0PDMRFJ3');
    expect(p04.geometry.type).toBe('Point');
    expect(p04.properties.Area).toBe(1.2);
    expect(booleanPointInPolygon(p04.geometry.coordinates as number[], fixture('P04'), { ignoreBoundary: true })).toBe(true);
  });

  it('coordinates are [longitude, latitude] (Kodagu: lon ≈ 75.7–76.0, lat ≈ 12.0–12.6)', () => {
    const fc = buildEudrGeoJson(MIXED, BASE);
    for (const f of fc.features) {
      for (const [lon, lat] of positions(f)) {
        expect(lon).toBeGreaterThan(75);
        expect(lon).toBeLessThan(77);
        expect(lat).toBeGreaterThan(11);
        expect(lat).toBeLessThan(14);
      }
    }
    // P03's first vertex, rounded to 6 decimals, in [lon, lat] order
    const first = fixture('P03').coordinates[0]![0]!;
    expect(rings(byProducer(fc, 'PR-YQZGQHEX'))[0]![0]).toEqual([Math.round(first[0]! * 1e6) / 1e6, Math.round(first[1]! * 1e6) / 1e6]);
  });

  it('every coordinate is rounded to 6 decimals, with no consecutive duplicates after rounding', () => {
    // A ring with two vertices about 3 cm apart that round to the same 6-decimal position: one vertex after rounding
    const dup: Polygon = structuredClone(fixture('P03'));
    const ring = dup.coordinates[0]!;
    const [x, y] = [Math.round(ring[1]![0]! * 1e6) / 1e6, Math.round(ring[1]![1]! * 1e6) / 1e6];
    ring.splice(1, 1, [x - 0.0000001, y + 0.0000001], [x + 0.0000002, y - 0.0000002]);
    const fc = buildEudrGeoJson(withPolygons([fixture('P01'), fixture('P10'), dup]), BASE);
    for (const f of fc.features) {
      for (const pos of positions(f)) {
        expect(pos).toHaveLength(2);
        for (const n of pos) expect(Number(n.toFixed(6))).toBe(n);
      }
      for (const r of rings(f)) {
        for (let i = 1; i < r.length; i++) expect(r[i], `${f.properties.ProducerName} vertex ${i}`).not.toEqual(r[i - 1]);
      }
    }
    expect(rings(byProducer(fc, 'PR-YQZGQHEX'))[0]).toHaveLength(fixture('P03').coordinates[0]!.length);
  });

  it('rings are closed with at least 4 positions, and only the outer ring is kept (no holes)', () => {
    const holed: Polygon = structuredClone(fixture('P03'));
    const [cx, cy] = [75.8497, 12.5968];
    holed.coordinates.push([
      [cx - 0.0002, cy - 0.0002],
      [cx + 0.0002, cy - 0.0002],
      [cx + 0.0002, cy + 0.0002],
      [cx - 0.0002, cy - 0.0002],
    ]);
    const fc = buildEudrGeoJson(withPolygons([fixture('P01'), fixture('P10'), holed]), BASE);
    for (const f of fc.features.filter((x) => x.geometry.type === 'Polygon')) {
      const g = f.geometry as { coordinates: number[][][] };
      expect(g.coordinates).toHaveLength(1);
      const r = g.coordinates[0]!;
      expect(r.length).toBeGreaterThanOrEqual(4);
      expect(r.at(-1)).toEqual(r[0]);
    }
  });

  it('properties: keys within the TP24 list with exact casing; ProducerName is the producer ID; country IN; district, Karnataka', () => {
    const fc = buildEudrGeoJson(MIXED, BASE);
    for (const f of fc.features) {
      for (const k of Object.keys(f.properties)) expect(TP24_KEYS).toContain(k);
      expect(f.properties.ProducerName).toMatch(/^PR-[0-9A-Z]{8}$/);
      expect(f.properties.ProducerCountry).toBe('IN');
      expect(f.properties.ProductionPlace).toBe('Kodagu, Karnataka');
      expect(f.properties.commodity).toBe('coffee');
      expect(f.properties.hs_code).toBe('0901 11');
      expect(f.properties.quantity_kg_cherry).toBe(124.5); // the batch's cherry kg (38 + 41.5 + 45)
      expect(f.properties.crop).toBe('Arabica');
      expect(f.properties.batch_id).toBe('B-CR3G933K');
      expect(f.properties.certificate_url).toBe('https://udgam.test/verify/B-CR3G933K?h=05d36abc389a');
    }
  });

  it('the polygon comes from the latest plot_registered / plot_edited payload of each plot', () => {
    const f = structuredClone(MIXED);
    // Re-anchor plot 1 (P01) with P03's shape: a later plot_edited wins, so it becomes a Polygon
    const last = [...f.entries].reverse().find((e) => e.kind === 'plot_edited' && e.payload.plotId === PLOTS[0].plotId)!;
    last.payload.polygon = fixture('P03');
    last.payload.areaHa = areaHa(fixture('P03'));
    expect(byProducer(buildEudrGeoJson(f, BASE), 'PR-0PDMRFJ3').geometry.type).toBe('Polygon');
  });

  it('validates against docs/eudr-geojson.schema.json (ajv)', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(SCHEMA);
    const fc = buildEudrGeoJson(MIXED, BASE);
    expect(validate(fc), JSON.stringify(validate.errors)).toBe(true);
    // and the schema has teeth: a name in ProducerName, lat/lon of the wrong type, a hole, an unknown key
    const bad = structuredClone(fc) as unknown as { features: { properties: Record<string, unknown>; geometry: { coordinates: unknown } }[] };
    bad.features[0]!.properties.ProducerName = 'Ramesh Kumar';
    expect(validate(bad)).toBe(false);
    const holed = structuredClone(fc) as unknown as { features: { geometry: { type: string; coordinates: number[][][] } }[] };
    const poly = holed.features.find((x) => x.geometry.type === 'Polygon')!;
    poly.geometry.coordinates.push(poly.geometry.coordinates[0]!);
    expect(validate(holed)).toBe(false);
    const extra = structuredClone(fc) as unknown as { features: { properties: Record<string, unknown> }[] };
    extra.features[0]!.properties.farmerName = 'x';
    expect(validate(extra)).toBe(false);
  });

  it('the real fixture feed (three 2.0 ha plots) exports three Points with Area 2', () => {
    const fc = buildEudrGeoJson(FEED, BASE);
    expect(fc.features.map((f) => [f.geometry.type, f.properties.Area])).toEqual([
      ['Point', 2],
      ['Point', 2],
      ['Point', 2],
    ]);
  });
});

describe('serializeEudrGeoJson (at least 6 decimal digits on the wire)', () => {
  it('writes every coordinate with exactly 6 decimals and parses back to the builder output', () => {
    const fc = buildEudrGeoJson(MIXED, BASE);
    const text = serializeEudrGeoJson(fc);
    expect(JSON.parse(text)).toEqual(fc);
    const coords = /"coordinates":(\[[^a-z"]*\])/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = coords.exec(text))) {
      for (const num of m[1]!.match(/-?\d+(?:\.\d+)?/g)!) {
        expect(num).toMatch(/^-?\d+\.\d{6}$/);
        n++;
      }
    }
    expect(n).toBe(2 + 2 * (fixture('P10').coordinates[0]!.length + fixture('P03').coordinates[0]!.length));
  });
});

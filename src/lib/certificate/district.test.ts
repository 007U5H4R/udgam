import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geo/types';
import { areaContains, DISTRICT_AREAS, districtAt, districtOf, regionOf } from './district';

// The certificate headline's district, derived from the anchored polygons (TSK-16.1, TP16). TASK-17 fix
// round 1: a point-in-polygon test against conservative district areas, so a plot in a neighbouring
// district is never claimed for Kodagu or Chikkamagaluru; anything unsure reads as the state.
const square = (lng: number, lat: number): Polygon => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + 0.001, lat], [lng + 0.001, lat + 0.001], [lng, lat + 0.001], [lng, lat]]] });

describe('district', () => {
  it('names Kodagu (Madikeri) and Chikkamagaluru (Mudigere) plots', () => {
    expect(districtAt({ lat: 12.4211, lng: 75.7392 })).toBe('Kodagu');
    expect(districtAt({ lat: 13.1365, lng: 75.6406 })).toBe('Chikkamagaluru');
    expect(districtAt({ lat: 12.97, lng: 77.59 })).toBeNull(); // Bengaluru
  });

  it.each([
    ['Madikeri', 12.4244, 75.7382, 'Kodagu'],
    ['Virajpet', 12.1965, 75.8044, 'Kodagu'],
    ['Somwarpet', 12.597, 75.8496, 'Kodagu'],
    ['Bhagamandala (fixture plot P09)', 12.3869, 75.5335, 'Kodagu'],
    ['south Kodagu near Kutta (fixture plot P10)', 12.0272, 75.9959, 'Kodagu'],
    ['Chikkamagaluru town', 13.3161, 75.772, 'Chikkamagaluru'],
    ['Koppa', 13.5307, 75.3609, 'Chikkamagaluru'],
    ['Sakleshpur', 12.9442, 75.7856, 'Hassan'],
    ['Hassan town', 13.0068, 76.0996, 'Hassan'],
    ['Sullia', 12.5583, 75.3894, 'Dakshina Kannada'],
    ['Puttur', 12.7597, 75.2012, 'Dakshina Kannada'],
  ])('%s (%f N, %f E) reads as %s', (_town, lat, lng, district) => {
    expect(districtAt({ lat, lng })).toBe(district);
  });

  it.each([
    ['Sakleshpur', 12.9442, 75.7856],
    ['Sullia', 12.5583, 75.3894],
    ['Belur (Hassan)', 13.1622, 75.8679],
    ['Piriyapatna (Mysuru)', 12.3365, 76.1012],
    ['Thirthahalli (Shivamogga)', 13.6889, 75.2433],
  ])('%s (%f N, %f E) is never claimed for Kodagu or Chikkamagaluru', (_town, lat, lng) => {
    expect(['Kodagu', 'Chikkamagaluru']).not.toContain(districtAt({ lat, lng }));
  });

  it.each([
    ['Kasaragod town', 12.4996, 74.9869],
    ['Perla', 12.66, 75.1],
    ['Adoor', 12.52, 75.25],
    ['Delampady', 12.567, 75.317],
  ])('%s (%f N, %f E) in Kasaragod, Kerala, is never read as Dakshina Kannada: no district (TASK-17 r2 N1)', (_town, lat, lng) => {
    expect(districtAt({ lat, lng })).toBeNull();
    expect(districtOf([square(lng, lat)])).toBe('Karnataka'); // the neutral fallback
  });

  it('the areas do not overlap: no vertex of one lies inside another', () => {
    for (const a of DISTRICT_AREAS) {
      for (const b of DISTRICT_AREAS) {
        if (a === b) continue;
        for (const [lng, lat] of a.ring) expect(areaContains(b, { lat, lng }), `${a.name} vertex ${lng},${lat} inside ${b.name}`).toBe(false);
      }
    }
  });

  it('one district, two districts, or the state', () => {
    expect(districtOf([square(75.739, 12.421), square(75.742, 12.422)])).toBe('Kodagu');
    expect(districtOf([square(75.739, 12.421), square(75.64, 13.13)])).toBe('Kodagu and Chikkamagaluru');
    expect(districtOf([square(75.739, 12.421), square(77.59, 12.97)])).toBe('Karnataka');
    expect(districtOf([square(75.785, 12.944)])).toBe('Hassan'); // Sakleshpur
    expect(districtOf([square(75.389, 12.558)])).toBe('Dakshina Kannada'); // Sullia
    expect(districtOf([])).toBe('Karnataka');
  });

  it('region line', () => {
    expect(regionOf('Kodagu')).toBe('Kodagu, Karnataka, India');
    expect(regionOf('Karnataka')).toBe('Karnataka, India');
  });
});

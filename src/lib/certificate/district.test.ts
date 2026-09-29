import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geo/types';
import { districtAt, districtOf, regionOf } from './district';

// The certificate headline's district, derived from the anchored polygons (TSK-16.1, TP16).
const square = (lng: number, lat: number): Polygon => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + 0.001, lat], [lng + 0.001, lat + 0.001], [lng, lat + 0.001], [lng, lat]]] });

describe('district', () => {
  it('names Kodagu (Madikeri) and Chikkamagaluru (Mudigere) plots', () => {
    expect(districtAt({ lat: 12.4211, lng: 75.7392 })).toBe('Kodagu');
    expect(districtAt({ lat: 13.1365, lng: 75.6406 })).toBe('Chikkamagaluru');
    expect(districtAt({ lat: 12.97, lng: 77.59 })).toBeNull(); // Bengaluru
  });

  it('one district, two districts, or the state', () => {
    expect(districtOf([square(75.739, 12.421), square(75.742, 12.422)])).toBe('Kodagu');
    expect(districtOf([square(75.739, 12.421), square(75.64, 13.13)])).toBe('Kodagu and Chikkamagaluru');
    expect(districtOf([square(75.739, 12.421), square(77.59, 12.97)])).toBe('Karnataka');
    expect(districtOf([])).toBe('Karnataka');
  });

  it('region line', () => {
    expect(regionOf('Kodagu')).toBe('Kodagu, Karnataka, India');
    expect(regionOf('Karnataka')).toBe('Karnataka, India');
  });
});

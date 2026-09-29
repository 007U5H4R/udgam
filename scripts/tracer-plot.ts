import type { Polygon } from '../src/lib/geo/types';

// The TKT-02 tracer's plot P01, with no runtime imports so the e2e and scripts can share it.
// TKT-03 generates the harness plot fixtures (evals/fixtures/plots); until then P01 lives here.

/** P01: a 2.0 ha convex hexagon near Madikeri, Kodagu (RFC 7946 order, counter-clockwise, 7 dp). */
export const P01_POLYGON: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [75.739986, 12.4213057],
      [75.7393573, 12.4218229],
      [75.7385331, 12.4216088],
      [75.7384847, 12.4207742],
      [75.7390777, 12.4202501],
      [75.7397745, 12.4205949],
      [75.739986, 12.4213057],
    ],
  ],
};
export const P01_AREA_HA = 2.0;
/** Near the centroid, well inside P01. */
export const P01_INSIDE = { lat: 12.4211, lng: 75.7392 };

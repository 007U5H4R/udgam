import type { PlotActionReason } from './actions';
import type { RegistrationStatus } from '../../../../lib/plots/plots';

// Words for the admin plot screens (TKT-06). English only: the admin surface ships in English (N5) and
// the Kannada dictionary covers the field app; these move into src/lib/i18n when the admin screens are
// translated. Every refusal names the problem and what to do (Design.md §18).

export const REASON_TEXT: Record<PlotActionReason, string> = {
  empty: 'The file has no boundary in it. Choose a file with the plot boundary.',
  not_polygon: 'The file must hold one plot boundary (a polygon), not points, lines or several plots.',
  open_ring: 'The boundary is not closed: its last point must be the same as its first.',
  too_few_positions: 'A boundary needs at least three corners.',
  self_intersection: 'The boundary crosses itself. Move the points so the lines do not cross.',
  has_holes: 'The boundary has a hole in it. The EU system does not accept holes; keep the outer edge only.',
  not_wgs84: 'The coordinates are not latitude and longitude. Export the file in WGS84 (EPSG:4326).',
  too_many_vertices: 'The boundary has more than 1000 points. Simplify it and try again.',
  duplicate_vertices: 'Two points next to each other are in the same place. Remove one of them.',
  degenerate: 'The boundary has almost no area: its points lie on a line. Check the corners and try again.',
  out_of_region: 'The boundary is not a plot in India. Check that latitude and longitude are not swapped, and that the file holds one plot.',
  unsupported_kml: 'This KML file has a document type declaration, which is not accepted. Export the KML again without it.',
  invalid_input: 'Choose a farmer (or enter a new farmer’s name) and a crop.',
  file_too_large: 'The file is larger than 2 MB. Simplify the boundary or export only this plot.',
  no_file: 'Draw the boundary on the map or choose a GeoJSON or KML file.',
  farmer_not_found: 'That farmer was not found. Choose another farmer.',
  not_found: 'That plot was not found.',
};

/** A Server Action that never answered (the network dropped, the server failed): CR-100, Design.md §18. */
export const FAILED_TEXT = 'That did not work. Nothing was changed. Check the connection and try again.';

export const STATUS_TEXT: Record<RegistrationStatus, string> = {
  pending: 'Registration checks pending',
  stale: 'Boundary changed · checks pending',
  fresh: 'Registration checks on record',
};

export const CROP_TEXT = { arabica: 'Arabica', robusta: 'Robusta' } as const;

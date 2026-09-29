import { env } from '../config/env';

// Satellite tiles for the admin plot editor only (TP19, research Q6). Default: Esri World Imagery through
// the keyed ArcGIS Location Platform basemap service (the unkeyed legacy server.arcgisonline.com is not
// used: its licence for a public demo is unverified). Fallback by one config value: MapTiler Satellite.
// The key is read here, on the server, and passed as a prop to the admin editor page only; it is never
// a NEXT_PUBLIC_ variable. Without a key there are no tiles and the editor still works.

export type TileProvider = 'esri' | 'maptiler';
export type TileLayerConfig = { url: string; attribution: string; maxZoom: number };
type Keys = { arcgis: string | undefined; maptiler: string | undefined };

/** Origins the admin plot pages load tiles from; TKT-19 allow-lists them in the admin CSP (§16). */
export const ADMIN_TILE_HOSTS = ['https://ibasemaps-api.arcgis.com', 'https://api.maptiler.com'] as const;

/** The tile layer for `provider`, or null when its key is missing. */
export function tileLayerConfig(
  provider: TileProvider = env.MAP_TILE_PROVIDER,
  keys: Keys = { arcgis: env.ARCGIS_API_KEY, maptiler: env.MAPTILER_KEY },
): TileLayerConfig | null {
  if (provider === 'maptiler') {
    if (!keys.maptiler) return null;
    return {
      url: `${ADMIN_TILE_HOSTS[1]}/maps/satellite/256/{z}/{x}/{y}@2x.jpg?key=${encodeURIComponent(keys.maptiler)}`,
      attribution: '© MapTiler © OpenStreetMap contributors',
      maxZoom: 20,
    };
  }
  if (!keys.arcgis) return null;
  return {
    url: `${ADMIN_TILE_HOSTS[0]}/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(keys.arcgis)}`,
    attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community | Powered by Esri',
    maxZoom: 19,
  };
}

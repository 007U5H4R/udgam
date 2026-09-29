import { describe, expect, it } from 'vitest';
import { ADMIN_TILE_HOSTS, tileLayerConfig } from './tiles';

// TSK-06.6 / TP19: satellite tiles for the admin plot editor from MAP_TILE_PROVIDER — the keyed Esri
// World Imagery basemap by default, MapTiler Satellite by one config value; no key → no tiles.

describe('tileLayerConfig', () => {
  it('esri: the keyed ArcGIS basemap service with the Esri attribution', () => {
    expect(tileLayerConfig('esri', { arcgis: 'AAPK-test/key', maptiler: undefined })).toEqual({
      url: 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=AAPK-test%2Fkey',
      attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community | Powered by Esri',
      maxZoom: 19,
    });
  });

  it('maptiler: MapTiler Satellite with its attribution', () => {
    expect(tileLayerConfig('maptiler', { arcgis: undefined, maptiler: 'mt-key' })).toEqual({
      url: 'https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}@2x.jpg?key=mt-key',
      attribution: '© MapTiler © OpenStreetMap contributors',
      maxZoom: 20,
    });
  });

  it("the provider's key missing → null (the editor shows the no-tiles state and still works)", () => {
    expect(tileLayerConfig('esri', { arcgis: undefined, maptiler: 'mt-key' })).toBeNull();
    expect(tileLayerConfig('maptiler', { arcgis: 'k', maptiler: undefined })).toBeNull();
  });

  it('never uses the unkeyed legacy server.arcgisonline.com', () => {
    expect(JSON.stringify(tileLayerConfig('esri', { arcgis: 'k', maptiler: undefined }))).not.toContain('arcgisonline');
  });
});

describe('ADMIN_TILE_HOSTS (for the admin-only CSP allow-list, §16)', () => {
  it('lists both tile origins', () => {
    expect(ADMIN_TILE_HOSTS).toEqual(['https://ibasemaps-api.arcgis.com', 'https://api.maptiler.com']);
  });
});

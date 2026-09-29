'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import type {} from 'leaflet-draw';
import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { TileLayerConfig } from '../../lib/geo/tiles';
import type { LatLng } from '../../lib/geo/types';

// The Leaflet half of the plot editor (TSK-06.6). Loaded only in the browser (PlotEditor imports it with
// `ssr:false`: Leaflet touches `window`). leaflet-draw 1.0.4 is a UMD script that extends the global `L`,
// so it is imported after `window.L` is set. It stays behind this component: a swap to leaflet-geoman
// changes this file only.
//   · drawing: L.Draw.Polygon — click to add points, "Finish shape" (or the first point) to close;
//   · editing: the polygon's L.Edit.Poly handler (what L.EditToolbar.Edit enables per layer) — drag a
//     corner, or drag a middle marker to add one. Every edit is reported back as the new ring.
// The vertex list and buttons beside the map (PlotEditor) are the non-drag alternative (WCAG 2.5.7).

export type MapProps = {
  ring: LatLng[];
  selected: number | null;
  drawing: boolean;
  /** Increments when "Finish shape" is pressed. */
  finishTick: number;
  tiles: TileLayerConfig | null;
  onDrawn: (ring: LatLng[]) => void;
  onEdited: (ring: LatLng[]) => void;
  onCenter: (c: LatLng) => void;
  onDrawReady?: () => void;
};

const KODAGU: [number, number] = [12.42, 75.74];
const LINE = { color: '#B9F5D2', weight: 3, fillColor: '#7FE3C1', fillOpacity: 0.16 };

type Editable = L.Polygon & { editing?: { enable(): void; disable(): void } };

const toRing = (latlngs: L.LatLng[] | L.LatLng[][] | L.LatLng[][][]): LatLng[] => {
  const flat = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[] | L.LatLng[][]) : (latlngs as L.LatLng[]);
  const ring = Array.isArray(flat[0]) ? (flat[0] as L.LatLng[]) : (flat as L.LatLng[]);
  return ring.map((p) => ({ lat: p.lat, lng: p.lng }));
};

/**
 * leaflet-draw's corner and middle handles are keyboard-focusable markers with no name. They are a
 * pointer-only shortcut: the named list and buttons beside the map do the same by keyboard, so the
 * handles are taken out of the tab order and the accessibility tree.
 */
function quietHandles(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('.leaflet-editing-icon')) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
    el.removeAttribute('role');
  }
}

let drawLoaded: Promise<void> | null = null;
function loadDraw(): Promise<void> {
  (window as unknown as { L: typeof L }).L = L;
  drawLoaded ??= import('leaflet-draw').then(() => undefined);
  return drawLoaded;
}

function EditorLayer({ ring, selected, drawing, finishTick, onDrawn, onEdited, onCenter, onDrawReady }: Omit<MapProps, 'tiles'>) {
  const map = useMap();
  const [ready, setReady] = useState(false);
  const poly = useRef<Editable | null>(null);
  const handler = useRef<L.Draw.Polygon | null>(null);
  const fitted = useRef(false);
  const cb = useRef({ onDrawn, onEdited, onCenter });
  useEffect(() => {
    cb.current = { onDrawn, onEdited, onCenter };
  });

  useEffect(() => {
    let live = true;
    void loadDraw().then(() => {
      if (!live) return;
      setReady(true);
      onDrawReady?.();
    });
    return () => {
      live = false;
    };
  }, [onDrawReady]);

  useEffect(() => {
    const root = map.getContainer();
    quietHandles(root);
    const observer = new MutationObserver(() => quietHandles(root));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [map]);

  // Report the map centre (where "Add point" puts a first point).
  useEffect(() => {
    const report = () => {
      const c = map.getCenter();
      cb.current.onCenter({ lat: c.lat, lng: c.lng });
    };
    report();
    map.on('moveend', report);
    return () => {
      map.off('moveend', report);
    };
  }, [map]);

  // The polygon: drawn from `ring`, editable by dragging once leaflet-draw is in.
  useEffect(() => {
    if (!ready || drawing || ring.length < 2) {
      poly.current?.editing?.disable();
      poly.current?.remove();
      poly.current = null;
      return;
    }
    const latlngs = ring.map((p) => L.latLng(p.lat, p.lng));
    if (!poly.current) {
      poly.current = L.polygon(latlngs, LINE).addTo(map) as Editable;
    } else {
      poly.current.editing?.disable();
      poly.current.setLatLngs(latlngs);
    }
    poly.current.editing?.enable();
    if (!fitted.current) {
      fitted.current = true;
      map.fitBounds(poly.current.getBounds(), { padding: [24, 24], maxZoom: 18 });
    }
  }, [ready, drawing, ring, map]);

  useEffect(
    () => () => {
      poly.current?.editing?.disable();
      poly.current?.remove();
    },
    [],
  );

  // Dragging a corner (or a middle marker) edits the polygon in place: report the new ring.
  useEffect(() => {
    const edited = () => {
      if (poly.current) cb.current.onEdited(toRing(poly.current.getLatLngs() as L.LatLng[][]));
    };
    map.on('draw:editvertex', edited);
    return () => {
      map.off('draw:editvertex', edited);
    };
  }, [map]);

  // Drawing mode.
  useEffect(() => {
    if (!ready || !drawing) return;
    const h = new L.Draw.Polygon(map as L.DrawMap, { showArea: false, allowIntersection: true, shapeOptions: LINE });
    const created = (e: L.LeafletEvent) => {
      const layer = (e as L.DrawEvents.Created).layer as L.Polygon;
      fitted.current = true;
      cb.current.onDrawn(toRing(layer.getLatLngs() as L.LatLng[][]));
    };
    map.on('draw:created', created);
    h.enable();
    handler.current = h;
    return () => {
      map.off('draw:created', created);
      h.disable();
      handler.current = null;
    };
  }, [ready, drawing, map]);

  useEffect(() => {
    if (finishTick > 0) handler.current?.completeShape();
  }, [finishTick]);

  const sel = selected !== null ? ring[selected] : undefined;
  return sel && !drawing ? (
    <CircleMarker center={[sel.lat, sel.lng]} radius={11} interactive={false} pathOptions={{ color: '#D8F58C', weight: 3, fillOpacity: 0 }} />
  ) : null;
}

export default function PlotEditorMap({ tiles, ...rest }: MapProps) {
  const first = rest.ring[0];
  return (
    <MapContainer center={first ? [first.lat, first.lng] : KODAGU} zoom={17} maxZoom={tiles?.maxZoom ?? 20} style={{ height: '100%', width: '100%' }} attributionControl>
      {tiles ? <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} /> : null}
      <EditorLayer {...rest} />
    </MapContainer>
  );
}

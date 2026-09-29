'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { areaHa, formatHa } from '../../lib/geo/area';
import type { TileLayerConfig } from '../../lib/geo/tiles';
import type { LatLng, PlotPolygon } from '../../lib/geo/types';
import { validatePolygon, type PlotGeomError } from '../../lib/geo/validate';
import { Pill } from '../ui/Pill';
import s from './PlotEditor.module.css';

// The plot boundary editor (TSK-06.6, TC-029). The map (Leaflet + leaflet-draw, browser-only) is for
// drawing by clicking and for dragging corners; beside it an accessible list of the boundary's points
// and buttons move the selected point 1 m north/south/east/west (or the arrow keys on a focused point),
// add a point after it, or remove it — so nothing needs a drag (WCAG 2.5.7). Every change is checked
// with the EU geometry rules (validatePolygon) and the live area is shown; the server recomputes both.

const PlotEditorMap = dynamic(() => import('./PlotEditorMap.client'), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Loading the map…</div>,
});

const M_PER_DEG_LAT = 111_320;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const pt = (lat: number, lng: number): LatLng => ({ lat: round6(lat), lng: round6(lng) });

/** Move a point by metres north and east. */
function nudge(p: LatLng, north: number, east: number): LatLng {
  return pt(p.lat + north / M_PER_DEG_LAT, p.lng + east / (M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)));
}

/** A closed WGS84 polygon from the open ring, or null below three points. */
export function ringToPolygon(ring: LatLng[]): PlotPolygon | null {
  if (ring.length < 3) return null;
  const coords = ring.map((p) => [round6(p.lng), round6(p.lat)]);
  return { type: 'Polygon', coordinates: [[...coords, coords[0]!]] };
}

function polygonToRing(g: PlotPolygon | null): LatLng[] {
  if (!g || g.type !== 'Polygon') return [];
  const outer = g.coordinates[0] ?? [];
  return outer.slice(0, -1).map(([lng, lat]) => pt(lat!, lng!));
}

/** Hectares as saved (2 dp) plus square metres, so a 1 m move always shows. */
function areaText(ha: number): string {
  return `Area ${formatHa(ha)} (${Math.round(ha * 10_000).toLocaleString('en-IN')} m²)`;
}

export type EditorChange = { geometry: PlotPolygon | null; error: PlotGeomError | null };

export type PlotEditorProps = {
  /** The region's name ("Edit the boundary", "Draw the boundary"). */
  title: string;
  initial: PlotPolygon | null;
  tiles: TileLayerConfig | null;
  /** Plain-language text for a geometry error. */
  reasonText: (reason: PlotGeomError) => string;
  onChange?: (change: EditorChange) => void;
  /** When given, the editor shows its own Save pill (the screen's one primary). */
  save?: { label: string; run: (geometry: PlotPolygon) => Promise<string | null> };
};

const DIRECTIONS = [
  ['north', 1, 0],
  ['south', -1, 0],
  ['east', 0, 1],
  ['west', 0, -1],
] as const;
const ARROWS: Record<string, readonly [number, number]> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };

export function PlotEditor({ title, initial, tiles, reasonText, onChange, save }: PlotEditorProps) {
  const multipart = initial?.type === 'MultiPolygon';
  const [ring, setRing] = useState<LatLng[]>(() => polygonToRing(initial));
  const [selected, setSelected] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [finishTick, setFinishTick] = useState(0);
  const [center, setCenter] = useState<LatLng>({ lat: 12.42, lng: 75.74 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [replaced, setReplaced] = useState(false);
  /** The points before "Draw again", restored by "Stop drawing". */
  const [beforeDraw, setBeforeDraw] = useState<{ ring: LatLng[]; replaced: boolean } | null>(null);

  const geometry = useMemo(() => ringToPolygon(ring), [ring]);
  const error: PlotGeomError | null = geometry ? validatePolygon(geometry) : ring.length > 0 ? 'too_few_positions' : null;
  const showMultipart = multipart && !replaced;

  useEffect(() => {
    if (!showMultipart) onChange?.({ geometry, error });
  }, [geometry, error, onChange, showMultipart]);

  const update = useCallback((next: LatLng[], sel: number | null) => {
    setRing(next);
    setSelected(sel);
    setSaveError('');
  }, []);

  const move = (i: number, north: number, east: number) => update(ring.map((p, j) => (j === i ? nudge(p, north, east) : p)), i);

  function addPoint() {
    const n = ring.length;
    const at = selected ?? n - 1;
    let p: LatLng;
    if (n === 0) p = pt(center.lat, center.lng);
    else if (n === 1) p = nudge(ring[0]!, 0, 10);
    else {
      const a = ring[at]!;
      const b = ring[(at + 1) % n]!;
      p = pt((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    }
    update([...ring.slice(0, at + 1), p, ...ring.slice(at + 1)], at + 1);
  }

  function removePoint() {
    if (selected === null) return;
    const next = ring.filter((_, j) => j !== selected);
    update(next, next.length === 0 ? null : Math.max(0, selected - 1));
  }

  function onPointKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(i, dir[0], dir[1]);
  }

  function startDrawing() {
    setBeforeDraw({ ring, replaced });
    setReplaced(true);
    update([], null);
    setDrawing(true);
  }

  function stopDrawing() {
    setDrawing(false);
    if (beforeDraw) {
      setReplaced(beforeDraw.replaced);
      update(beforeDraw.ring, null);
    }
  }

  const onDrawn = useCallback(
    (r: LatLng[]) => {
      setDrawing(false);
      update(
        r.map((p) => pt(p.lat, p.lng)),
        null,
      );
    },
    [update],
  );
  const onEdited = useCallback((r: LatLng[]) => update(r.map((p) => pt(p.lat, p.lng)), null), [update]);

  async function onSave() {
    if (!save || !geometry || error) return;
    setSaving(true);
    setSaveError('');
    try {
      const failure = await save.run(geometry);
      if (failure) setSaveError(failure);
    } finally {
      setSaving(false);
    }
  }

  const n = ring.length;
  return (
    <section className={s.editor} aria-label={title}>
      <div className={s.map}>
        <PlotEditorMap
          ring={ring}
          selected={selected}
          drawing={drawing}
          finishTick={finishTick}
          tiles={tiles}
          onDrawn={onDrawn}
          onEdited={onEdited}
          onCenter={setCenter}
        />
      </div>
      {tiles ? null : <p className={s.note}>Satellite tiles unavailable — draw on the outline or upload a file.</p>}

      <div className={s.status}>
        <p className={s.area} id="editor-area" aria-live="polite">
          {geometry ? areaText(areaHa(geometry)) : 'Area —'}
        </p>
        <p className={s.error} id="editor-error" role="alert">
          {showMultipart ? '' : error ? reasonText(error) : saveError}
        </p>
      </div>

      {showMultipart ? (
        <p className={s.note}>This boundary has several parts. Upload a file to change it, or draw one new boundary.</p>
      ) : null}

      <div className={s.tools}>
        {drawing ? (
          <>
            <button type="button" className={s.btn} onClick={() => setFinishTick((t) => t + 1)}>
              Finish shape
            </button>
            <button type="button" className={s.btn} onClick={stopDrawing}>
              Stop drawing
            </button>
          </>
        ) : (
          <button type="button" className={s.btn} onClick={startDrawing}>
            {n > 0 || showMultipart ? 'Draw again on the map' : 'Draw on the map'}
          </button>
        )}
      </div>
      {drawing ? <p className={s.note}>Click the map at each corner of the plot, then press Finish shape.</p> : null}

      {!showMultipart && !drawing ? (
        <>
          <div className={s.moves} role="group" aria-label="Change the selected point">
            {DIRECTIONS.map(([dir, north, east]) => (
              <button key={dir} type="button" className={s.btn} disabled={selected === null} onClick={() => selected !== null && move(selected, north, east)}>
                Move {dir} 1 m
              </button>
            ))}
            <button type="button" className={s.btn} onClick={addPoint} disabled={n >= 1000}>
              Add point
            </button>
            <button type="button" className={s.btn} onClick={removePoint} disabled={selected === null}>
              Remove point
            </button>
          </div>
          <p className={s.note} id="points-hint">
            Choose a point, then move it with the buttons or the arrow keys (1 m a step).
          </p>
          {n > 0 ? (
            <ol className={s.points} aria-label="Boundary points" aria-describedby="points-hint">
              {ring.map((p, i) => (
                <li key={i}>
                  <button type="button" className={s.point} aria-pressed={selected === i} onClick={() => setSelected(i)} onKeyDown={(e) => onPointKey(e, i)}>
                    <span className={s.pointNo}>Point {i + 1}</span>
                    <span className={s.pointAt}>
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}

      {save ? (
        <div className={s.save}>
          <Pill type="button" onClick={onSave} disabled={saving || !geometry || error !== null || showMultipart}>
            {saving ? 'Saving…' : save.label}
          </Pill>
        </div>
      ) : null}
    </section>
  );
}

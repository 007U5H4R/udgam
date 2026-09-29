'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition, type FormEvent } from 'react';
import { PlotEditor, type EditorChange } from '../../../../components/admin/PlotEditor';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { Pill } from '../../../../components/ui/Pill';
import type { TileLayerConfig } from '../../../../lib/geo/tiles';
import type { FarmerOption } from '../../../../lib/plots/farmers';
import { createPlotAction, uploadPlotFileAction, type PlotActionResult } from './actions';
import { REASON_TEXT } from './copy';
import s from './plots.module.css';

// The new-plot form (TKT-06): farmer (existing or new), crop, then the boundary — drawn on the map or
// uploaded as a GeoJSON/KML file (a chosen file wins). One primary pill.

const NEW = 'new';

export function NewPlotForm({ farmers, tiles }: { farmers: FarmerOption[]; tiles: TileLayerConfig | null }) {
  const router = useRouter();
  const [farmer, setFarmer] = useState(farmers.length > 0 ? '' : NEW);
  const [drawn, setDrawn] = useState<EditorChange>({ geometry: null, error: null });
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const onDrawnChange = useCallback((c: EditorChange) => setDrawn(c), []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('farmerId') === NEW) form.delete('farmerId');
    const file = form.get('file');
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile) {
      form.delete('file');
      if (drawn.error) return setError(REASON_TEXT[drawn.error]);
      if (!drawn.geometry) return setError(REASON_TEXT.no_file);
      form.set('geojson', JSON.stringify(drawn.geometry));
    }
    setError('');
    startTransition(async () => {
      const r: PlotActionResult = hasFile ? await uploadPlotFileAction(form) : await createPlotAction(form);
      if (r.ok) router.push(`/admin/plots/${r.plotId}`);
      else setError(REASON_TEXT[r.reason]);
    });
  }

  return (
    <form className={s.form} onSubmit={onSubmit} aria-labelledby="new-h" noValidate>
      <GlassCard as="section" className={s.fieldset} aria-labelledby="farmer-h">
        <h3 className={s.legend} id="farmer-h">
          Farmer
        </h3>
        <label className={s.label} htmlFor="farmerId">
          Whose plot is it?
        </label>
        <select id="farmerId" name="farmerId" className={s.control} value={farmer} onChange={(e) => setFarmer(e.target.value)} required>
          {farmers.length > 0 ? (
            <option value="" disabled>
              Choose a farmer
            </option>
          ) : null}
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.producerId}
            </option>
          ))}
          <option value={NEW}>A new farmer…</option>
        </select>
        {farmer === NEW ? (
          <>
            <label className={s.label} htmlFor="newFarmerName">
              New farmer’s name
            </label>
            <input id="newFarmerName" name="newFarmerName" className={s.control} autoComplete="off" maxLength={120} required />
            <label className={s.label} htmlFor="newFarmerIdentifier">
              Member number <span>(optional, stays inside your FPO)</span>
            </label>
            <input id="newFarmerIdentifier" name="newFarmerIdentifier" className={s.control} autoComplete="off" maxLength={64} />
          </>
        ) : null}
      </GlassCard>

      <GlassCard as="section" className={s.fieldset} aria-labelledby="crop-h">
        <fieldset className={[s.radios, s.bare].join(' ')}>
          <legend className={s.legend} id="crop-h">
            Crop
          </legend>
          <label className={s.radio}>
            <input type="radio" name="crop" value="arabica" defaultChecked />
            Arabica
          </label>
          <label className={s.radio}>
            <input type="radio" name="crop" value="robusta" />
            Robusta
          </label>
        </fieldset>
      </GlassCard>

      <GlassCard as="section" className={s.fieldset} aria-labelledby="boundary-h">
        <h3 className={s.legend} id="boundary-h">
          Boundary
        </h3>
        <PlotEditor title="Draw the boundary" initial={null} tiles={tiles} reasonText={(r) => REASON_TEXT[r]} onChange={onDrawnChange} />
        <label className={s.label} htmlFor="file">
          Or upload a boundary file <span>(GeoJSON or KML, up to 2 MB)</span>
        </label>
        <input id="file" name="file" type="file" accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml" className={s.control} />
        <p className={s.note}>One plot per file, in latitude and longitude (WGS84). Holes and crossing lines are refused.</p>
      </GlassCard>

      <p className={s.error} role="alert" id="plot-error">
        {error}
      </p>
      <div className={s.actions}>
        <Pill type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save plot'}
        </Pill>
      </div>
    </form>
  );
}

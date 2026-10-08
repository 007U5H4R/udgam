'use client';

import { useActionState, useState } from 'react';
import { createBatchAction, type CreateBatchState } from '../../app/(admin)/admin/batches/actions';
import { formatKg } from '../../lib/batches/format';
import { Pill } from '../ui/Pill';
import s from './BatchBuilder.module.css';
import { chosenCrop, plotsOf, shownEvents, toggleCrop, type Crop } from './batch-builder-state';

// The batch builder (TSK-14.5): the org's eligible pickings as checkbox rows. A batch holds one crop,
// so choosing a picking disables the rows of the other crop; the one primary pill counts the pickings
// and kilograms chosen. The server re-checks everything and the database enforces it (TP14).
// DES-107: a plot filter and "Select all <crop>" (ghost buttons) above the rows, for 50-picking batches;
// a filtered-out row stays in the form (hidden), so a choice made under another filter is still sent.

export type BuilderEvent = { eventId: string; crop: Crop; plot: string; cherryKg: number; title: string; facts: string };

export type BuilderLabels = {
  list: string;
  otherCrop: string;
  none: string;
  /** Templates with {kg} (and {n}). */
  createOne: string;
  createMany: string;
  working: string;
  note: string;
  /** DES-107: the plot filter and select all. Templates with {n}, {plot}, {crop}, {shown}. */
  filter: string;
  filterAll: string;
  filterPlot: string;
  selectAll: string;
  clearAll: string;
  shown: string;
  crops: Record<Crop, string>;
  errors: Record<NonNullable<CreateBatchState['error']>, string>;
};

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));

export function BatchBuilder({ events, labels }: { events: BuilderEvent[]; labels: BuilderLabels }) {
  const [state, action, pending] = useActionState<CreateBatchState, FormData>(createBatchAction, { error: null });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [plot, setPlot] = useState<string | null>(null);
  // Only pickings still listed count (after a refused create the list may have changed).
  const selected = events.filter((e) => chosen.has(e.eventId));
  const crop = chosenCrop(events, chosen);
  const plots = plotsOf(events);
  const shown = shownEvents(events, plot !== null && plots.some((p) => p.plot === plot) ? plot : null);
  const shownIds = new Set(shown.map((e) => e.eventId));
  const crops = (['arabica', 'robusta'] as const).filter((c) => shown.some((e) => e.crop === c));
  const kg = formatKg(selected.reduce((sum, e) => sum + e.cherryKg, 0));
  const label =
    selected.length === 0 ? labels.none : selected.length === 1 ? fill(labels.createOne, { kg }) : fill(labels.createMany, { n: selected.length, kg });

  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <form action={action} className={s.form} aria-busy={pending || undefined}>
      <input type="hidden" name="crop" value={crop ?? ''} />
      <div className={s.tools}>
        {plots.length > 1 ? (
          <div className={s.filter}>
            <label htmlFor="pick-plot">{labels.filter}</label>
            <select id="pick-plot" value={plot ?? ''} onChange={(ev) => setPlot(ev.currentTarget.value || null)} disabled={pending}>
              <option value="">{fill(labels.filterAll, { n: events.length })}</option>
              {plots.map((p) => (
                <option key={p.plot} value={p.plot}>
                  {fill(labels.filterPlot, { plot: p.plot, n: p.n })}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {crops.map((c) => {
          const ids = shown.filter((e) => e.crop === c).map((e) => e.eventId);
          const all = ids.every((id) => chosen.has(id));
          return (
            <button
              key={c}
              type="button"
              className={s.tool}
              disabled={(crop !== null && crop !== c) || pending}
              onClick={() => setChosen((prev) => toggleCrop(shown, prev, c, events))}
            >
              {all ? fill(labels.clearAll, { crop: labels.crops[c] }) : fill(labels.selectAll, { crop: labels.crops[c], n: ids.length })}
            </button>
          );
        })}
        <p className={s.shown} role="status">
          {shown.length < events.length ? fill(labels.shown, { shown: shown.length, n: events.length }) : ''}
        </p>
      </div>
      <ul className={s.list} aria-label={labels.list}>
        {events.map((e) => {
          const otherCrop = crop !== null && e.crop !== crop;
          const id = `pick-${e.eventId}`;
          return (
            <li key={e.eventId} hidden={!shownIds.has(e.eventId)}>
              <label className={s.row} htmlFor={id}>
                <input
                  className={s.check}
                  type="checkbox"
                  id={id}
                  name="eventId"
                  value={e.eventId}
                  checked={chosen.has(e.eventId)}
                  disabled={otherCrop || pending}
                  onChange={(ev) => toggle(e.eventId, ev.currentTarget.checked)}
                  aria-describedby={otherCrop ? `${id}-why` : undefined}
                />
                <span className={s.title}>{e.title}</span>
                <span className={s.kg}>{formatKg(e.cherryKg)} kg</span>
                <span className={s.facts}>{e.facts}</span>
                {otherCrop ? (
                  <span className={s.why} id={`${id}-why`}>
                    {labels.otherCrop}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      <div className={s.actions}>
        <p className={s.error} role="alert">
          {state.error && !pending ? labels.errors[state.error] : ''}
        </p>
        <Pill type="submit" disabled={selected.length === 0 || pending} aria-busy={pending || undefined}>
          {pending ? labels.working : label}
        </Pill>
        <p className={s.note}>{labels.note}</p>
      </div>
    </form>
  );
}

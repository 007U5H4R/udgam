import Link from 'next/link';
import type { ReactNode } from 'react';
import { GlassCard } from '../../../../components/ui/GlassCard';
import pill from '../../../../components/ui/Pill.module.css';
import { formatHa } from '../../../../lib/geo/area';
import { log } from '../../../../lib/log';
import type { PlotSummary } from '../../../../lib/plots/plots';
import { CROP_TEXT, STATUS_TEXT } from './copy';
import { Icon, StatusMark } from './marks';
import type { ViewState } from './state';
import s from './plots.module.css';

// The plots screen frame (TKT-06): the list column and the detail column, in admin.html's grammar.
// Below 1100 px only one column shows: the list on /admin/plots, the detail (with Back) elsewhere.

export type ListView = { state: ViewState; plots: PlotSummary[] };

export function PlotsScreen({
  list,
  selectedId,
  detailOpen,
  primaryAdd,
  children,
}: {
  list: ListView;
  selectedId?: string;
  /** A plot or the new-plot form is showing (narrow screens show only the detail). */
  detailOpen: boolean;
  /** "Add a plot" is the screen's one primary pill (the list screen); elsewhere it is secondary. */
  primaryAdd: boolean;
  children: ReactNode;
}) {
  const { state, plots } = list;
  return (
    <main className={[s.main, detailOpen ? s.open : ''].filter(Boolean).join(' ')}>
      <section className={s.queue} aria-labelledby="plots-h">
        <header>
          <p className={s.eyebrow}>Plots</p>
          <h1 id="plots-h" className={s.h1}>
            {state === 'working' ? (
              <>
                <span className={s.lit}>{plots.length}</span> {plots.length === 1 ? 'Registered plot' : 'Registered plots'}
              </>
            ) : (
              'Registered plots'
            )}
          </h1>
          {state === 'working' ? <p className={s.sub}>Boundaries on record, most recently changed first.</p> : null}
          <Link href="/admin/plots/new" className={[pill.pill, primaryAdd ? '' : pill.ghost, s.addPill].filter(Boolean).join(' ')}>
            Add a plot
          </Link>
        </header>
        {state === 'working' ? <PlotList plots={plots} selectedId={selectedId} /> : null}
        {state === 'loading' ? <Loading /> : null}
        {state === 'empty' ? (
          <GlassCard as="section" className={s.stateCard} aria-labelledby="plots-empty-h">
            <h2 id="plots-empty-h">No plots yet.</h2>
            <p>Add a farmer’s plot by drawing its boundary on the map or uploading a GeoJSON or KML file.</p>
          </GlassCard>
        ) : null}
        {state === 'error' ? (
          <GlassCard as="section" className={[s.stateCard, s.err].join(' ')} role="alert" aria-labelledby="plots-error-h">
            <div className={s.stIc} aria-hidden="true">
              <Icon name="wifiOff" className={s.ic} />
            </div>
            <h2 id="plots-error-h">Couldn’t load the plots.</h2>
            <p>Nothing was changed.</p>
            <Link href="/admin/plots" className={[pill.pill, pill.amber, s.statePill].join(' ')}>
              <Icon name="retry" className={s.ic} />
              Try again
            </Link>
          </GlassCard>
        ) : null}
      </section>
      <section className={s.detail} aria-label="Plot detail">
        <div className={s.dBody}>
          <Link href="/admin/plots" className={s.back}>
            <Icon name="back" className={s.ic} />
            Back to plots
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}

function PlotList({ plots, selectedId }: { plots: PlotSummary[]; selectedId?: string }) {
  return (
    <ul className={s.list} aria-label="Plots">
      {plots.map((p) => (
        <li key={p.id}>
          <Link href={`/admin/plots/${p.id}`} className={s.item} aria-current={p.id === selectedId ? 'page' : undefined}>
            <span className={s.bub} aria-hidden="true">
              <Icon name="plot" className={s.ic} />
            </span>
            <span className={s.itemId}>
              {p.farmerName} · {p.id}
            </span>
            <span className={s.itemArea}>{formatHa(p.areaHa)}</span>
            <span className={s.itemMeta}>
              {p.producerId} · {CROP_TEXT[p.crop]}
            </span>
            <span className={[s.itemStatus, s[`st_${p.status}`]].join(' ')}>
              <StatusMark status={p.status} className={s.mk} />
              {STATUS_TEXT[p.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Loading() {
  return (
    <div aria-busy="true">
      <p className={s.loadNote}>
        <Icon name="ring" className={s.ic} />
        Loading the plots…
      </p>
      <ul className={s.list} aria-hidden="true">
        {[62, 58, 64].map((w) => (
          <li key={w} className={[s.skRow, s.skCard].join(' ')}>
            <span className={[s.sk, s.skDot].join(' ')} />
            <span className={[s.sk, s.skLine].join(' ')} style={{ width: `${w}%` }} />
            <span className={[s.sk, s.skLine].join(' ')} style={{ width: `${w - 18}%` }} />
            <span className={[s.sk, s.skLine].join(' ')} style={{ width: `${w + 12}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The org's plots for the list column: the forced state, or the real list (empty / error / working). */
export async function loadList(forced: ViewState | null, load: () => Promise<PlotSummary[]>): Promise<ListView> {
  if (forced === 'loading' || forced === 'error') return { state: forced, plots: [] };
  if (forced === 'empty') return { state: 'empty', plots: [] };
  try {
    const plots = await load();
    return { state: plots.length === 0 ? 'empty' : 'working', plots };
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'plots.list_failed');
    return { state: 'error', plots: [] };
  }
}

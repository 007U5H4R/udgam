'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setPref } from '../../client/db';
import { getDevice } from '../../client/device-key';
import { distanceToEdgeM } from '../../lib/geo/distance';
import { locate } from '../../lib/geo/geofence';
import type { PlotPolygon } from '../../lib/geo/types';
import { LANG_COOKIE, t, type Lang } from '../../lib/i18n';
import type { Verdict } from '../../lib/verification/types';
import { LanguageSheet } from '../../app/(agent)/enrol/LanguageSheet';
import { GlassCard } from '../ui/GlassCard';
import { Pill } from '../ui/Pill';
import { PlotMap } from '../ui/PlotSvg';
import { Sheet } from '../ui/Sheet';
import { TabBar } from '../ui/TabBar';
import { VerdictChip } from '../ui/VerdictChip';
import { HelpSheet, type HelpInfo } from './HelpSheet';
import { Ic } from './icons';
import { Lit } from './Lit';
import { PendingList } from './PendingRow';
import { useGps } from './useGps';

// Home (final/index.html #s1, TSK-10.5): header with the wordmark and the language chip, the greeting
// with the IST date, the plot card (the hero: the plot outline, the live "You" dot and where you are),
// the one primary pill, and the last three pickings. The tab bar floats at the bottom; its Help tab opens
// the Help sheet in place (TSK-11.6), which /field/help opens on arrival (`helpOpen`).

export type HomePlotView = { id: string; name: string; farmerName: string; facts: string; geojson: PlotPolygon };
export type HomeRow = { eventId: string; date: string; kg: string; verdict: Verdict | null };

const YEAR_S = 365 * 24 * 3600;

export function HomeClient({
  lang,
  greeting,
  plots,
  selectedId,
  rows,
  help,
  helpOpen = false,
}: {
  lang: Lang;
  greeting: { text: string; dateIso: string; date: string };
  plots: HomePlotView[];
  selectedId: string | null;
  rows: HomeRow[];
  help: HelpInfo;
  /** /field/help: the Help sheet is open on arrival. */
  helpOpen?: boolean;
}) {
  const router = useRouter();
  const tr = (key: Parameters<typeof t>[0], vars: Record<string, string | number> = {}) => t(key, vars, lang);
  const plot = plots.find((p) => p.id === selectedId) ?? plots[0] ?? null;
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [helpShown, setHelpShown] = useState(helpOpen);
  const { state: gpsState, fix } = useGps();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let live = true;
    getDevice()
      .then((d) => live && setEnrolled(d !== null))
      .catch(() => live && setEnrolled(false));
    return () => {
      live = false;
    };
  }, []);

  function heading() {
    if (!plot) return tr('home.noPlots.title');
    if (gpsState === 'denied') return tr('home.denied');
    if (!fix) return tr('home.finding');
    if (locate(fix, plot.geojson).inside) return <Lit k="home.inside" vars={{ plot: plot.name }} lit="plot" lang={lang} />;
    const m = `${Math.round(distanceToEdgeM(fix, plot.geojson))} m`;
    return <Lit k="home.outside" vars={{ plot: plot.name, m }} lit="plot" lang={lang} />;
  }

  function closeHelp() {
    setHelpShown(false);
    if (helpOpen) router.replace('/field'); // leave the /field/help deep link
  }

  function chooseLang(next: Lang) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${YEAR_S}; samesite=lax`;
    setPref('lang', next).catch(() => undefined);
    setLangOpen(false);
    router.refresh();
  }

  return (
    <main className="screen has-tabs" aria-labelledby="s1-h">
      <header className="top">
        <span className="wordmark">
          <Image src="/brand/cherry.svg" alt="" width={40} height={40} unoptimized />
          {tr('app.name')}
        </span>
        <button className="chip" type="button" aria-haspopup="dialog" aria-label={tr('lang.label')} onClick={() => setLangOpen(true)}>
          <Ic name="globe" />
          {lang === 'kn' ? <span lang="en">{t('lang.en')}</span> : <span lang="kn">{t('lang.kn')}</span>}
        </button>
      </header>
      <p className="greet">
        {tr('home.greeting', { greet: greeting.text })}
        <time dateTime={greeting.dateIso}>{greeting.date}</time>
      </p>

      <GlassCard as="article" className="plot-card">
        {plot ? (
          <>
            <p className="where">
              <Ic name="location" />
              {plot.farmerName}
            </p>
            <PlotMap
              geometry={plot.geojson}
              idBase={`home-${plot.id}`}
              point={fix}
              youLabel={tr('home.you')}
              label={tr(fix ? 'home.mapLabel' : 'home.mapLabelNoFix', { plot: plot.name })}
            />
          </>
        ) : null}
        <h1 className="h1 plot-h" id="s1-h" tabIndex={-1}>
          {heading()}
        </h1>
        {plot ? <p className="facts">{plot.facts}</p> : <p className="facts">{tr('home.noPlots.body')}</p>}
        {plot && gpsState === 'denied' ? <p className="lede">{tr('home.deniedHelp')}</p> : null}
        {plots.length > 1 ? (
          <button className="textbtn" type="button" aria-haspopup="dialog" onClick={() => setChoosing(true)}>
            {tr('home.changePlot')}
          </button>
        ) : null}
      </GlassCard>

      {plot && enrolled === false ? (
        <Pill className="record" icon={<Ic name="seal" />} onClick={() => router.push('/enrol')}>
          {tr('home.setUp')}
        </Pill>
      ) : (
        <Pill className="record" icon={<Ic name="camera" />} disabled={!plot} onClick={() => plot && router.push(`/field/record?plot=${encodeURIComponent(plot.id)}`)}>
          {tr('home.record')}
        </Pill>
      )}

      <h2 className="sec-h">{tr('home.recent')}</h2>
      <PendingList lang={lang} />
      {rows.length === 0 ? (
        <p className="lede" data-testid="home-empty">
          {tr('home.empty')}
        </p>
      ) : (
        <ul className="rows" data-testid="home-rows">
          {rows.map((r) => (
            <GlassCard as="li" card={false} className="row" key={r.eventId} data-event={r.eventId}>
              <span>
                <span className="r-date">{r.date}</span>
                <span className="r-kg">{r.kg}</span>
              </span>
              {r.verdict ? <VerdictChip verdict={r.verdict} lang={lang} /> : null}
            </GlassCard>
          ))}
        </ul>
      )}

      <TabBar current={helpShown ? 'help' : 'home'} lang={lang} onHelp={() => setHelpShown(true)} />

      {plots.length > 1 ? (
        <Sheet open={choosing} onClose={() => setChoosing(false)} labelledBy="plots-h">
          <h2 id="plots-h">{tr('home.choosePlot')}</h2>
          {plots.map((p) => (
            <Pill
              key={p.id}
              variant="ghost"
              aria-pressed={p.id === plot?.id}
              onClick={() => {
                setChoosing(false);
                router.replace(`/field?plot=${encodeURIComponent(p.id)}`);
              }}
            >
              {tr('home.plotChoice', { plot: p.name, farmer: p.farmerName })}
            </Pill>
          ))}
          <button className="textbtn" type="button" onClick={() => setChoosing(false)}>
            {tr('home.close')}
          </button>
        </Sheet>
      ) : null}
      <HelpSheet
        open={helpShown}
        onClose={closeHelp}
        lang={lang}
        info={help}
        onLanguage={() => {
          closeHelp();
          setLangOpen(true);
        }}
      />
      <LanguageSheet open={langOpen} current={lang} onChoose={chooseLang} />
    </main>
  );
}

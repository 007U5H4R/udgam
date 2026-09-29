import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { HomeClient, type HomePlotView, type HomeRow } from '../../../../components/field/HomeClient';
import { ha1, istDayMonth, istIsoDate, istLongDate, istPartOfDay, istShortDay, kg1 } from '../../../../components/field/format';
import { HomeError, HomeSkeleton } from '../../../../components/field/HomeStates';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { getFieldHome, type FieldHome } from '../../../../lib/db/queries/field-home';
import { isLang, LANG_COOKIE, t, type Lang } from '../../../../lib/i18n';
import { log } from '../../../../lib/log';
import { requireSession } from '../../../_auth/require';

// /field — the capture Home (technical-plan §3.2, final/index.html #s1, TSK-10.5). The plot the agent
// picked most recently is preselected (Design.md §8); `?plot=` switches to another assigned plot.
// `?state=loading|empty|error` renders that state in dev and e2e builds only (§11). The (home) group keeps
// Home's loading and error states to Home: a loading boundary above /field/pickings/[eventId] would start
// the stream before its notFound(), and another agent's picking must answer 404, not 200 (TKT-11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Home · Udgam' };

type Forced = 'loading' | 'empty' | 'error' | null;

function forcedState(v: unknown): Forced {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return v === 'loading' || v === 'empty' || v === 'error' ? v : null;
}

function view(home: FieldHome, lang: Lang): { plots: HomePlotView[]; rows: HomeRow[] } {
  const tr = (key: Parameters<typeof t>[0], vars: Record<string, string | number> = {}) => t(key, vars, lang);
  return {
    plots: home.plots.map((p) => {
      const crop = tr(p.crop === 'arabica' ? 'crop.arabica' : 'crop.robusta');
      return {
        id: p.id,
        name: tr('home.plotName', { n: p.ordinal }),
        farmerName: p.farmerName,
        geojson: p.geojson,
        facts: p.lastPickedAt
          ? tr('home.facts', { ha: ha1(p.areaHa), crop, date: istDayMonth(p.lastPickedAt, lang) })
          : tr('home.factsNew', { ha: ha1(p.areaHa), crop }),
      };
    }),
    rows: home.recent.map((r) => ({ eventId: r.eventId, date: istShortDay(r.receivedAt, lang), kg: tr('home.kg', { kg: kg1(r.cherryKg) }), verdict: r.verdict })),
  };
}

export default async function FieldHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const agent = await requireSession('agent');
  const params = await searchParams;
  const forced = forcedState(params.state);
  const cookie = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookie) ? cookie : 'en';

  if (forced === 'loading') return <HomeSkeleton lang={lang} />;
  let home: FieldHome | null = null;
  if (forced !== 'error') {
    try {
      home = await getFieldHome(await getDbReady(), agent.userId, agent.orgId);
    } catch (err) {
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'field.home_failed');
    }
  }
  if (!home) return <HomeError lang={lang} />;
  if (forced === 'empty') home = { ...home, recent: [] };

  const now = new Date().toISOString();
  const { plots, rows } = view(home, lang);
  const wanted = typeof params.plot === 'string' ? params.plot : null;
  return (
    <HomeClient
      lang={lang}
      greeting={{ text: t(`home.greet.${istPartOfDay(now)}`, {}, lang), dateIso: istIsoDate(now), date: istLongDate(now, lang) }}
      plots={plots}
      selectedId={plots.some((p) => p.id === wanted) ? wanted : (plots[0]?.id ?? null)}
      rows={rows}
    />
  );
}

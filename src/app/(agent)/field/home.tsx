import { HomeClient, type HomePlotView, type HomeRow } from '../../../components/field/HomeClient';
import { ha1, istDayMonth, istIsoDate, istLongDate, istPartOfDay, istShortDay } from '../../../components/field/format';
import { kg1 } from '../../../lib/format';
import { HomeError, HomeSkeleton } from '../../../components/field/HomeStates';
import { getDbReady } from '../../../lib/db/client';
import { getFieldHome, type FieldHome } from '../../../lib/db/queries/field-home';
import { getHelpInfo, type HelpInfo } from '../../../lib/db/queries/field-help';
import { t, type Lang } from '../../../lib/i18n';
import { log } from '../../../lib/log';
import { errFields } from '../../_log/err-fields';
import type { Guarded } from '../../_auth/require';
import { forcedState, langFromCookies, throwIfForced } from './route-state';

// The capture Home, shared by /field ((home)/page.tsx) and /field/help (technical-plan §3.2, final/index.html #s1,
// TSK-10.5; the Help sheet deep link TSK-11.6). The plot the agent picked most recently is preselected
// (Design.md §8); `?plot=` switches to another assigned plot. `?state=loading|empty|error` renders that
// state in dev and e2e builds only (§11), and `?state=throw` throws to show the route's error boundary.

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

/** Home for the signed-in `agent` (each page guards itself first: tests/guard-coverage.test.ts). */
export async function renderFieldHome(agent: Guarded, searchParams: Promise<Record<string, string | string[] | undefined>>, o: { helpOpen?: boolean } = {}) {
  const params = await searchParams;
  throwIfForced(params.state);
  const forced = forcedState(params.state);
  const lang = await langFromCookies();

  if (forced === 'loading') return <HomeSkeleton lang={lang} />;
  let home: FieldHome | null = null;
  let help: HelpInfo | null = null;
  if (forced !== 'error') {
    try {
      const db = await getDbReady();
      [home, help] = await Promise.all([getFieldHome(db, agent.userId, agent.orgId), getHelpInfo(db, agent.userId, agent.orgId)]);
    } catch (err) {
      log.error(errFields(err), 'field.home_failed');
    }
  }
  if (!home || !help) return <HomeError lang={lang} />;
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
      help={help}
      helpOpen={o.helpOpen ?? false}
    />
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { monthYear } from '../../../../../components/field/format';
import { PendingList } from '../../../../../components/field/PendingRow';
import { PickingRow } from '../../../../../components/field/PickingRow';
import { env } from '../../../../../lib/config/env';
import { getDbReady } from '../../../../../lib/db/client';
import { getHelpInfo, type HelpInfo } from '../../../../../lib/db/queries/field-help';
import { listPickings, type PickingMonth } from '../../../../../lib/db/queries/pickings';
import { isLang, LANG_COOKIE, t, type Lang } from '../../../../../lib/i18n';
import { log } from '../../../../../lib/log';
import { requireSession } from '../../../../_auth/require';
import { PickingsFrame } from '../PickingsFrame';
import { PickingsEmpty, PickingsError, PickingsSkeleton } from '../PickingsStates';

// /field/pickings — the Pickings tab (technical-plan §3.2, final/index.html #s8, TSK-11.4): every
// picking this agent sent, by IST month, newest first, each with its verdict chip; Needs a check and
// Not accepted say why. Pickings saved on this phone and not sent yet are listed first (TSK-11.3).
// `?state=loading|empty|error` renders that state in dev and e2e builds only (§11). The (list) group keeps
// the list's loading and error states off /field/pickings/[eventId], which must answer 404 for another
// agent's picking (a loading boundary above it would stream a 200 first).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pickings · Udgam' };

type Forced = 'loading' | 'empty' | 'error' | null;

function forcedState(v: unknown): Forced {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return v === 'loading' || v === 'empty' || v === 'error' ? v : null;
}

/** "7 pickings · Plot 2" (the plots of that month, in order of their latest picking). */
function monthCount(m: PickingMonth, lang: Lang): string {
  const plots = [...new Set(m.items.map((i) => i.plotName))].join(', ');
  return m.items.length === 1 ? t('pk.count1', { plots }, lang) : t('pk.count', { n: m.items.length, plots }, lang);
}

export default async function Pickings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const agent = await requireSession('agent');
  const forced = forcedState((await searchParams).state);
  const cookie = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookie) ? cookie : 'en';

  if (forced === 'loading') return <PickingsSkeleton lang={lang} />;
  let months: PickingMonth[] | null = null;
  let help: HelpInfo | null = null;
  if (forced !== 'error') {
    try {
      const db = await getDbReady();
      [months, help] = await Promise.all([forced === 'empty' ? [] : listPickings(db, agent.userId, agent.orgId, lang), getHelpInfo(db, agent.userId, agent.orgId)]);
    } catch (err) {
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'field.pickings_failed');
    }
  }
  if (!months || !help) return <PickingsError lang={lang} />;

  return (
    <PickingsFrame lang={lang} help={help}>
      <PendingList lang={lang} />
      {months.length === 0 ? <PickingsEmpty lang={lang} /> : null}
      {months.map((m) => (
        <section key={m.month} aria-labelledby={`m-${m.month}`} data-month={m.month}>
          <div className="month">
            <h2 id={`m-${m.month}`}>{monthYear(m.month, lang)}</h2>
            <span>{monthCount(m, lang)}</span>
          </div>
          <ul className="rows">
            {m.items.map((i) => (
              <PickingRow key={i.eventId} item={i} lang={lang} />
            ))}
          </ul>
        </section>
      ))}
    </PickingsFrame>
  );
}

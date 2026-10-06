import type { Metadata } from 'next';
import { RailShell } from '../../../../components/ui/Rail';
import { forcedState as pickState } from '../../../../lib/config/test-surfaces';
import { getDbReady } from '../../../../lib/db/client';
import { formatIst, listPhones, userName, type PhonesView, type PlotOption } from '../../../../lib/enrolment/phones';
import { t } from '../../../../lib/i18n';
import { log } from '../../../../lib/log';
import { requireSession } from '../../../_auth/require';
import { PhonesClient, type AgentView, type Option } from './PhonesClient';
import { PhonesEmpty, PhonesError, PhonesSkeleton } from './states';
import s from './phones.module.css';

// /admin/phones (technical-plan §3.2, TSK-05.7). No mockup: composed per TP17 from the ported rail,
// frosted cards, rows, chips, pills and the tinted sheet, in the admin grammar (rail + list). Each agent
// shows their phones (set up, last picking, revoked), "Issue code", "Revoke" and their plots.
// `?state=loading|empty|error` renders that state in dev and e2e builds only (§11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Phones · Udgam' };

type Forced = 'loading' | 'empty' | 'error' | null;

function forcedState(v: unknown): Forced {
  return pickState(v, ['loading', 'empty', 'error']);
}

const plotLabel = (p: PlotOption) => t('phones.plotLabel', { plot: p.id, farmer: p.farmerName, crop: p.crop, area: p.areaHa.toFixed(2) });

function toView(v: PhonesView): AgentView[] {
  return v.agents.map((a) => {
    const assigned = new Set(a.plots.map((p) => p.id));
    const options: Option[] = v.plots.filter((p) => !assigned.has(p.id)).map((p) => ({ id: p.id, label: plotLabel(p) }));
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      phones: a.devices.map((d) => ({
        id: d.id,
        enrolled: formatIst(d.enrolledAt),
        revoked: d.revokedAt ? formatIst(d.revokedAt) : null,
        lastCapture: d.lastCaptureAt ? formatIst(d.lastCaptureAt) : null,
      })),
      plots: a.plots.map((p) => ({ id: p.id, label: plotLabel(p) })),
      options,
    };
  });
}

export default async function PhonesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireSession('admin');
  const forced = forcedState((await searchParams).state);

  let name: string | null = null;
  let agents: AgentView[] | null = null; // null: failed to load
  if (forced === null) {
    try {
      const db = await getDbReady();
      name = await userName(db, admin.userId);
      agents = toView(await listPhones(db, admin.orgId));
    } catch (err) {
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'phones.load_failed');
    }
  }
  const state = forced ?? (agents === null ? 'error' : agents.length === 0 ? 'empty' : 'working');
  const body =
    state === 'loading' ? <PhonesSkeleton /> : state === 'error' ? <PhonesError /> : state === 'empty' || !agents ? <PhonesEmpty /> : <PhonesClient agents={agents} />;

  return (
    <RailShell current="phones" me={name ? { name } : undefined}>
      <main className={s.page}>
        <header>
          <h1 className={s.h1}>{t('phones.title')}</h1>
          <p className={s.sub}>{t('phones.sub')}</p>
        </header>
        {body}
      </main>
    </RailShell>
  );
}

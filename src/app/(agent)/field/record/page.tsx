import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RecordFlow } from '../../../../components/field/RecordFlow';
import { getDbReady } from '../../../../lib/db/client';
import { getFieldHome, recentKgRange } from '../../../../lib/db/queries/field-home';
import { t } from '../../../../lib/i18n';
import { requireSession } from '../../../_auth/require';
import { langFromCookies, throwIfForced } from '../route-state';

// /field/record?plot=<id> — the record flow (technical-plan §3.2; final/index.html #s2 #s3 #s3-kg #s4
// #s5 #s6, and Not accepted from the D5 template). Only a plot assigned to the signed-in agent in their
// own organisation opens; anything else goes back to Home. A failure shows the /field error boundary.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Record a picking · Udgam' };

export default async function RecordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const agent = await requireSession('agent');
  const { plot: wanted, state } = await searchParams;
  throwIfForced(state); // dev and e2e only: shows the /field error boundary
  const lang = await langFromCookies();
  const db = await getDbReady();
  const home = await getFieldHome(db, agent.userId, agent.orgId);
  const plot = home.plots.find((p) => p.id === wanted);
  if (!plot) redirect('/field');
  const range = await recentKgRange(db, agent.userId, plot.id);
  return <RecordFlow plot={{ id: plot.id, name: t('home.plotName', { n: plot.ordinal }, lang) }} lang={lang} range={range} />;
}

import { and, desc, eq } from 'drizzle-orm';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Pill } from '../../../components/ui/Pill';
import { TabBar } from '../../../components/ui/TabBar';
import { VerdictChip } from '../../../components/ui/VerdictChip';
import { Ic } from '../../../components/field/icons';
import { getDbReady } from '../../../lib/db/client';
import { harvestEvents } from '../../../lib/db/schema';
import { t } from '../../../lib/i18n';
import { requireSession } from '../../_auth/require';

// /field — Home (index.html #s1). The ported components in place; TSK-10.5 adds the plot card.
export const dynamic = 'force-dynamic';

export default async function FieldHome() {
  const agent = await requireSession('agent');
  const db = await getDbReady();
  const rows = await db
    .select({ id: harvestEvents.id, kg: harvestEvents.cherryKg, at: harvestEvents.serverReceivedAt, verdict: harvestEvents.finalVerdict })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.agentId, agent.userId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .orderBy(desc(harvestEvents.serverReceivedAt))
    .limit(3);
  return (
    <main className="screen has-tabs">
      <h1 className="vh">{t('tabs.home')}</h1>
      <Pill className="record" icon={<Ic name="camera" />}>
        {t('home.record')}
      </Pill>
      <h2 className="sec-h">{t('home.recent')}</h2>
      <ul className="rows">
        {rows.map((r) => (
          <GlassCard as="li" card={false} className="row" key={r.id}>
            <span>
              <span className="r-kg">{t('home.kg', { kg: (r.kg ?? 0).toFixed(1) })}</span>
            </span>
            {r.verdict ? <VerdictChip verdict={r.verdict} /> : null}
          </GlassCard>
        ))}
      </ul>
      <TabBar current="home" />
    </main>
  );
}

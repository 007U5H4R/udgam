import type { Metadata } from 'next';
import Link from 'next/link';
import { BatchBuilder } from '../../../../../components/admin/BatchBuilder';
import { ListLoading, StateCard } from '../../../../../components/buyer/BatchStates';
import { Icon } from '../../../../../components/buyer/Icon';
import screen from '../../../../../components/buyer/BatchScreen.module.css';
import pill from '../../../../../components/ui/Pill.module.css';
import { listEligibleEvents } from '../../../../../lib/batches/eligible';
import { formatScore, istDateTime } from '../../../../../lib/batches/format';
import { orgNames } from '../../../../../lib/batches/read';
import { forcedViewState } from '../../../../../lib/batches/view-state';
import { getDbReady } from '../../../../../lib/db/client';
import { t } from '../../../../../lib/i18n';
import { requireSession } from '../../../../_auth/require';
import { cropLabel } from '../../../../../components/buyer/labels';

// /admin/batches/new (TSK-14.5): the batch builder, a single list column (TP17) with the one primary
// pill at the bottom. `?state=loading|empty|error` forces a state for e2e (§11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New batch · Udgam' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewBatchPage({ searchParams }: Props) {
  const me = await requireSession('admin');
  const state = forcedViewState((await searchParams).state);
  const db = await getDbReady();
  const [events, names] = await Promise.all([state ? [] : listEligibleEvents(db, me.orgId), orgNames(db, [me.orgId])]);

  return (
    <main className={`${screen.main} ${screen.single}`}>
      <section className={screen.queue} aria-labelledby="builder-h">
        <Link className={screen.back} href="/admin/batches">
          <Icon name="arrowLeft" />
          {t('batches.back')}
        </Link>
        <header>
          <p className={screen.eyebrow}>{t('batches.builder.eyebrow', { org: names.get(me.orgId) ?? '' })}</p>
          <h1 className={screen.h1} id="builder-h">
            {t('batches.builder.title')}
          </h1>
          <p className={screen.sub}>{t('batches.builder.sub')}</p>
        </header>
        {state === 'loading' ? (
          <ListLoading label={t('batches.loading')} />
        ) : state === 'error' ? (
          <StateCard
            kind="error"
            title={t('batches.error.title')}
            body={t('batches.error.body')}
            action={
              <Link className={`${pill.pill} ${pill.amber} ${screen.statePill}`} href="/admin/batches/new">
                {t('batches.error.retry')}
              </Link>
            }
          />
        ) : state === 'empty' || events.length === 0 ? (
          <StateCard kind="empty" title={t('batches.builder.empty.title')} body={t('batches.builder.empty.body')} />
        ) : (
          <BatchBuilder
            events={events.map((e) => ({
              eventId: e.eventId,
              crop: e.crop,
              cherryKg: e.cherryKg,
              title: t('batches.builder.row', { plot: e.plotName, producer: e.producerId }),
              facts: t('batches.builder.rowFacts', { crop: cropLabel(e.crop), when: istDateTime(e.receivedAt), score: formatScore(e.score) }),
            }))}
            labels={{
              list: t('batches.builder.label'),
              otherCrop: t('batches.builder.otherCrop'),
              none: t('batches.builder.none'),
              createOne: t('batches.builder.create.one'),
              createMany: t('batches.builder.create.many'),
              working: t('batches.builder.working'),
              note: t('batches.builder.note'),
              errors: {
                empty: t('batches.builder.error.empty'),
                not_eligible: t('batches.builder.error.not_eligible'),
                mixed_crop: t('batches.builder.error.mixed_crop'),
              },
            }}
          />
        )}
      </section>
    </main>
  );
}

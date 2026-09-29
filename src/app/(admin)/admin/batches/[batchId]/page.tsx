import type { Metadata } from 'next';
import Link from 'next/link';
import { TransferForm } from '../../../../../components/admin/TransferForm';
import { CustodyChain, LockedLine } from '../../../../../components/buyer/CustodyChain';
import { Icon } from '../../../../../components/buyer/Icon';
import screen from '../../../../../components/buyer/BatchScreen.module.css';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import { RailShell } from '../../../../../components/ui/Rail';
import { formatKg, formatScore, istDateTime } from '../../../../../lib/batches/format';
import { getOrgBatch, listBuyerOrgs, listOrgBatches } from '../../../../../lib/batches/read';
import { getDbReady } from '../../../../../lib/db/client';
import { userName } from '../../../../../lib/enrolment/phones';
import { t } from '../../../../../lib/i18n';
import { requireSession, scopedById } from '../../../../_auth/require';
import { BatchList } from '../BatchList';
import { cropLabel, pickingsLabel } from '../../../../../components/buyer/labels';

// /admin/batches/[batchId] (TSK-14.5, TC-060): members, totals, the certificate link and — while the
// batch is open — the signed transfer; once transferred, the custody line instead. Another org's batch
// is a 404, like an unknown one (EVAL-080).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batch · Udgam' };

type Props = { params: Promise<{ batchId: string }> };

export default async function BatchDetailPage({ params }: Props) {
  const me = await requireSession('admin');
  const { batchId } = await params;
  const db = await getDbReady();
  const batch = scopedById(await getOrgBatch(db, me.orgId, batchId));
  const [batches, buyers, name] = await Promise.all([listOrgBatches(db, me.orgId), batch.status === 'open' ? listBuyerOrgs(db) : [], userName(db, me.userId)]);
  const certificate = `/verify/${encodeURIComponent(batch.batchId)}?h=${batch.shortHash}`;

  return (
    <RailShell current="batches" me={name ? { name } : undefined}>
      <main className={`${screen.main} ${screen.detailOpen}`}>
        <BatchList orgName={batch.orgName} batches={batches} state={null} currentId={batch.batchId} primary={false} />
        <section className={screen.detail} aria-labelledby="d-h">
          <div className={screen.dBody}>
            <Link className={screen.back} href="/admin/batches">
              <Icon name="arrowLeft" />
              {t('batches.back')}
            </Link>
            <header>
              <p className={screen.eyebrow}>{t('batches.detail.eyebrow', { org: batch.orgName })}</p>
              <h2 className={screen.dTitle} id="d-h">
                {batch.batchId}
              </h2>
              <p className={screen.dMeta}>
                {t('batches.detail.created', { when: istDateTime(batch.createdAt) })} · {t(batch.status === 'open' ? 'batches.row.open' : 'batches.row.transferred')}
              </p>
            </header>

            <GlassCard as="section" className={screen.card} aria-labelledby="score-h">
              <p className={screen.scoreLine} id="score-h">
                {t('batches.detail.score', { score: formatScore(batch.integrityScore) })}
              </p>
              <p className={screen.facts}>
                {t('batches.detail.facts', { kg: formatKg(batch.quantityKg), crop: cropLabel(batch.crop).toLowerCase(), pickings: pickingsLabel(batch.pickings) })}
              </p>
              <a className={screen.link} href={certificate} data-testid="certificate-link">
                {t('batches.detail.certificate')}
              </a>
              <p className={screen.note}>{t('batches.detail.certificateNote')}</p>
            </GlassCard>

            <GlassCard as="section" className={screen.card} aria-labelledby="members-h">
              <h2 className={screen.secH} id="members-h">
                {t('batches.detail.members')}
              </h2>
              <ul className={screen.rows}>
                {batch.members.map((m) => (
                  <li className={screen.fieldRow} key={m.eventId}>
                    <b>{t('batches.detail.member', { plot: m.plotName, producer: m.producerId })}</b>
                    <span className={screen.kg}>{t('batches.kg', { kg: formatKg(m.cherryKg) })}</span>
                    <span className={screen.meta}>{t('batches.detail.memberFacts', { when: istDateTime(m.receivedAt), score: formatScore(m.score) })}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>

            {batch.status === 'open' ? (
              <TransferForm
                batchId={batch.batchId}
                buyers={buyers}
                labels={{
                  title: t('batches.transfer.title'),
                  buyer: t('batches.transfer.buyer'),
                  choose: t('batches.transfer.choose'),
                  note: t('batches.transfer.note'),
                  submit: t('batches.transfer.submit'),
                  working: t('batches.transfer.working'),
                  noBuyers: t('batches.transfer.noBuyers'),
                  errors: { not_open: t('batches.transfer.error.not_open'), not_buyer: t('batches.transfer.error.not_buyer') },
                }}
              />
            ) : (
              <GlassCard as="div" className={screen.card} data-testid="custody-line">
                <CustodyChain
                  heading={t('batches.custody.title')}
                  headingId="custody-h"
                  links={batch.custody.map((c) => ({
                    label: t('batches.custody.link', { from: c.fromOrgName, to: c.toOrgName }),
                    when: t('batches.custody.when', { when: istDateTime(c.transferredAt) }),
                  }))}
                />
                <LockedLine text={t('batches.custody.locked')} />
              </GlassCard>
            )}
          </div>
        </section>
      </main>
    </RailShell>
  );
}

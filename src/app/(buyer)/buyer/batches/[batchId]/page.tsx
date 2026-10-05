import type { Metadata } from 'next';
import Link from 'next/link';
import { CustodyChain } from '../../../../../components/buyer/CustodyChain';
import { Icon } from '../../../../../components/buyer/Icon';
import screen from '../../../../../components/buyer/BatchScreen.module.css';
import { cropLabel, pickingsLabel, plotsLabel } from '../../../../../components/buyer/labels';
import { PlotAttestationLine } from '../../../../../components/ui/AttestationLine';
import { BatchQr } from '../../../../../components/ui/BatchQr';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import pill from '../../../../../components/ui/Pill.module.css';
import { batchAttestations } from '../../../../../lib/attestations/for-batch';
import { getBuyerBatch, listBuyerBatches } from '../../../../../lib/batches/buyer';
import { formatKg, formatScore, istDateTime } from '../../../../../lib/batches/format';
import { orgNames } from '../../../../../lib/batches/read';
import { getDbReady } from '../../../../../lib/db/client';
import { t } from '../../../../../lib/i18n';
import { istDate } from '../../../../../lib/verification/evidence';
import { requireSession, scopedById } from '../../../../_auth/require';
import { BuyerList } from '../../BuyerList';

// /buyer/batches/[batchId] (TSK-14.6, TC-060): score, quantity, the plots by producer ID (never a
// farmer's name, EV16), the custody chain and the certificate link. A batch this buyer does not hold is
// a 404, like an unknown one (EVAL-080).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batch · Udgam' };

type Props = { params: Promise<{ batchId: string }> };

export default async function BuyerBatchPage({ params }: Props) {
  const me = await requireSession('buyer');
  const { batchId } = await params;
  const db = await getDbReady();
  const batch = scopedById(await getBuyerBatch(db, me.orgId, batchId));
  const [batches, names, organic] = await Promise.all([listBuyerBatches(db, me.orgId), orgNames(db, [me.orgId]), batchAttestations(db, batch.batchId)]);
  const today = istDate(new Date().toISOString()); // TC-058: the organic line per plot (QA-P5-2)
  const orgName = names.get(me.orgId) ?? '';
  const pickings = batch.plots.reduce((n, p) => n + p.pickings, 0);

  return (
    <main className={`${screen.main} ${screen.detailOpen}`}>
      <BuyerList orgName={orgName} batches={batches} state={null} currentId={batch.batchId} />
      <section className={screen.detail} aria-labelledby="d-h">
        <div className={screen.dBody}>
          <Link className={screen.back} href="/buyer">
            <Icon name="arrowLeft" />
            {t('batches.back')}
          </Link>
          <header>
            <p className={screen.eyebrow}>{t('buyer.detail.eyebrow', { org: orgName })}</p>
            <h2 className={screen.dTitle} id="d-h">
              {batch.batchId}
            </h2>
            <p className={screen.dMeta}>{t('buyer.detail.from', { org: batch.fromOrgName, when: istDateTime(batch.transferredAt) })}</p>
          </header>

          <GlassCard as="section" className={screen.card} aria-labelledby="score-h">
            <p className={screen.scoreLine} id="score-h">
              {t('batches.detail.score', { score: formatScore(batch.integrityScore) })}
            </p>
            <p className={screen.facts}>
              {t('batches.detail.facts', { kg: formatKg(batch.quantityKg), crop: cropLabel(batch.crop).toLowerCase(), pickings: pickingsLabel(pickings) })} ·{' '}
              {plotsLabel(batch.plotCount)}
            </p>
            <div className={screen.headActions}>
              <a className={pill.pill} href={`/verify/${encodeURIComponent(batch.batchId)}?h=${batch.shortHash}`} data-testid="certificate-link">
                {t('batches.detail.certificate')}
              </a>
            </div>
            <p className={screen.note}>
              {t('batches.detail.certificateNote')}
            </p>
          </GlassCard>

          <BatchQr batchId={batch.batchId} shortHash={batch.shortHash} />

          <GlassCard as="section" className={screen.card} aria-labelledby="plots-h">
            <h2 className={screen.secH} id="plots-h">
              {t('buyer.detail.producers')}
            </h2>
            <ul className={screen.rows}>
              {batch.plots.map((p) => (
                <li className={screen.fieldRow} key={p.plotId}>
                  <b>{t('buyer.detail.producer', { plot: p.plotId, producer: p.producerId })}</b>
                  <span className={screen.kg}>{t('batches.kg', { kg: formatKg(p.cherryKg) })}</span>
                  <span className={screen.meta}>{pickingsLabel(p.pickings)}</span>
                  <PlotAttestationLine record={organic.get(p.plotId)} today={today} />
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard as="div" className={screen.card} data-testid="custody-chain">
            <CustodyChain
              heading={t('batches.custody.title')}
              headingId="custody-h"
              links={batch.custody.map((c) => ({
                label: t('batches.custody.link', { from: c.fromOrgName, to: c.toOrgName }),
                when: t('batches.custody.when', { when: istDateTime(c.transferredAt) }),
              }))}
            />
          </GlassCard>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from 'next';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import { PlotSvg } from '../../../../../components/ui/PlotSvg';
import { getDbReady } from '../../../../../lib/db/client';
import { listAttestations } from '../../../../../lib/attestations/attach';
import { userName } from '../../../../../lib/enrolment/phones';
import { formatHa } from '../../../../../lib/geo/area';
import { tileLayerConfig } from '../../../../../lib/geo/tiles';
import { getPlot, listPlots } from '../../../../../lib/plots/plots';
import { toRegistrationChecks } from '../../../../../lib/plots/registration';
import { istDate } from '../../../../../lib/verification/evidence';
import { requireSession, scopedById } from '../../../../_auth/require';
import { CROP_TEXT, STATUS_TEXT } from '../copy';
import { EditBoundary } from '../EditBoundary';
import { Icon, StatusMark } from '../marks';
import { adminName, loadList, PlotsScreen } from '../PlotsScreen';
import { RegistrationCard } from '../RegistrationCard';
import { forcedState } from '../state';
import s from '../plots.module.css';
import { AttestationCard } from './attestation/AttestationCard';

// /admin/plots/[plotId] (TKT-06): one plot's outline (PlotSvg), area in hectares, registration status,
// the registration checks with "Check again" (TKT-07), the organic certificate attestation (TKT-13) and the boundary editor. Another org's plot ID is a 404, like an unknown one (TC-019). The tile key
// is read on the server and handed only to this admin page's editor (TP19).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plot · Udgam' };

export default async function PlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ plotId: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { orgId, userId } = await requireSession('admin');
  const { plotId } = await params;
  const db = await getDbReady();
  const plot = scopedById(await getPlot(db, orgId, plotId));
  const list = await loadList(forcedState((await searchParams).state), () => listPlots(db, orgId));
  const me = await adminName(() => userName(db, userId));
  const area = formatHa(plot.areaHa);
  const certificates = await listAttestations(db, orgId, plot.id);
  return (
    <PlotsScreen me={me} list={list} selectedId={plot.id} detailOpen primaryAdd={false}>
      <header>
        <p className={s.eyebrow}>
          Farm {plot.farmerName} · {plot.producerId}
        </p>
        <div className={s.dTitle}>
          <h2>{plot.id}</h2>
          <span className={[s.chip, s[`chip_${plot.status}`]].join(' ')}>
            <StatusMark status={plot.status} className={s.mk} />
            {STATUS_TEXT[plot.status]}
          </span>
        </div>
        <p className={s.dMeta}>
          {CROP_TEXT[plot.crop]} · registered {istDate(plot.createdAt)}
          {plot.updatedAt !== plot.createdAt ? ` · boundary changed ${istDate(plot.updatedAt)}` : ''}
        </p>
      </header>
      <div className={s.dGrid}>
        <GlassCard as="section" className={s.plotCard} aria-labelledby="plot-area">
          <figure className={s.figure}>
            <p className={s.where}>
              <Icon name="location" className={s.ic} />
              Boundary on record
            </p>
            <div className={s.plotMap}>
              <PlotSvg geometry={plot.geometry} idBase={`plot-${plot.id}`} label={`Outline of plot ${plot.id}, ${area}.`} />
            </div>
            <figcaption>
              <p className={s.plotSay} id="plot-area">
                Area {area}
              </p>
              <p className={s.checkLine}>
                <StatusMark status={plot.status === 'fresh' ? 'fresh' : 'pending'} className={s.mk} />
                {plot.status === 'fresh' ? 'Registration checks on record' : 'Registration checks pending'}
              </p>
            </figcaption>
          </figure>
        </GlassCard>
        <RegistrationCard plotId={plot.id} checks={toRegistrationChecks(plot.registrationChecks)} stale={plot.registrationStale} />
        <AttestationCard plotId={plot.id} records={certificates} today={istDate(new Date().toISOString())} />
        <GlassCard as="section" className={[s.sectionCard, s.wide].join(' ')} aria-labelledby="edit-h">
          <h3 className={s.secH} id="edit-h">
            Boundary
          </h3>
          <p className={s.note}>Editing the boundary records a new version; the registration checks run again for it.</p>
          <div className={s.editorWrap}>
            <EditBoundary key={plot.anchorSeq} plotId={plot.id} geometry={plot.geometry} tiles={tileLayerConfig()} />
          </div>
        </GlassCard>
      </div>
    </PlotsScreen>
  );
}

import { GlassCard } from '../../../../components/ui/GlassCard';
import type { RegistrationStatus } from '../../../../lib/plots/plots';
import { needsRerun, type RegistrationCheck, type RegistrationChecks } from '../../../../lib/plots/registration';
import { StatusMark } from './marks';
import { RerunChecks } from './RerunChecks';
import s from './plots.module.css';

// The plot's registration checks (TKT-07, F2, TC-034): forest loss since 2021 and the 12-month NDVI
// history, each with its status word, mark and evidence sentence (the measured number and the
// threshold). Composed from the plot screens' own parts (TP17); the labels are the review screen's
// (final/admin.html CHECKS). A check that could not run offers "Check again" (a ghost pill: the page's
// one primary stays the boundary save). The data source is always named: fixture answers are demo
// data, never presented as real satellite evidence (CF-11, EXE12).

const LABEL: Record<RegistrationCheck['id'], string> = {
  deforestation_overlap: 'Forest map',
  ndvi_cultivation: 'Coffee grown here, 12 months',
};

/** final/admin.html ST words; the word always sits beside a mark (never colour alone). */
function word(c: RegistrationCheck): string {
  if (c.status === 'fail') return c.hardFail ? 'Failed · final' : 'Failed';
  if (c.status === 'unavailable') return 'Couldn’t run';
  return c.status === 'flag' ? 'Flagged' : 'Passed';
}
/** Where the answers came from, in words (CF-11). */
const SOURCE_LINE: Record<RegistrationChecks['source'], string> = {
  fixture: 'Data source: demo data (fixture provider), not real satellite imagery',
  live: 'Data source: Global Forest Watch and Copernicus Sentinel-2',
};
const mark = (c: RegistrationCheck): RegistrationStatus => (c.status === 'ok' ? 'fresh' : c.status === 'unavailable' ? 'pending' : 'stale');

export function RegistrationCard({ plotId, checks, stale }: { plotId: string; checks: RegistrationChecks | null; stale: boolean }) {
  const rows = checks ? [checks.forestLoss, checks.ndviHistory] : [];
  const offerRerun = checks === null || stale || needsRerun(checks);
  return (
    <GlassCard as="section" className={s.sectionCard} aria-labelledby="reg-h">
      <h3 className={s.secH} id="reg-h">
        Registration checks
      </h3>
      {checks === null || stale ? (
        <p className={s.note}>{stale ? 'The boundary changed; the checks have not run for the new boundary yet.' : 'The checks have not run for this plot yet.'}</p>
      ) : (
        <>
          <ul className={s.regList} data-testid="registration-checks">
            {rows.map((c) => (
              <li key={c.id}>
                <p className={s.checkLine}>
                  <StatusMark status={mark(c)} className={s.mk} />
                  {LABEL[c.id]} · {word(c)}
                </p>
                <p className={s.note}>{c.evidence}</p>
              </li>
            ))}
          </ul>
          <p className={s.note} data-testid="registration-source">
            {SOURCE_LINE[checks.source]}
          </p>
        </>
      )}
      {offerRerun ? <RerunChecks plotId={plotId} /> : null}
    </GlassCard>
  );
}

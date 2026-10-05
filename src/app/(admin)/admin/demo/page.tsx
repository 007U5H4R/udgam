import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { Pill } from '../../../../components/ui/Pill';
import { RailShell } from '../../../../components/ui/Rail';
import { VerdictChip, verdictWord } from '../../../../components/ui/VerdictChip';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { userName } from '../../../../lib/enrolment/phones';
import { requireSession } from '../../../_auth/require';
import { submitAttackForm } from './actions';
import { attackStatuses, demoEnabled, failureOf, readManifest, type AttackStatus } from './attacks';
import s from './demo.module.css';

// /admin/demo (technical-plan §3.2, TSK-20.3, TP27): "Demo tools", with the four staged attacks, one card each, with one
// pill to submit it through the capture pipeline. Once submitted, the card shows the system verdict
// (word + mark, never colour alone) and the evidence of the check that should catch it, with a link to
// its review page. No mockup: composed per TP17. Test-only: 404 unless DEMO_MODE=1 outside a production
// deployment (attacks.ts demoEnabled).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Demo tools · Udgam admin' };

const CHECK_NAMES: Record<string, string> = {
  geofence: 'Inside the plot',
  photo_uniqueness: 'New photos',
  yield_plausibility: 'Season yield',
  deforestation_overlap: 'Forest loss since 2021',
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!demoEnabled(env)) notFound();
  const admin = await requireSession('admin');
  const db = await getDbReady();
  const manifest = await readManifest(env.DATA_DIR);
  const name = await userName(db, admin.userId);
  const statuses = manifest ? await attackStatuses(db, admin.orgId, manifest) : [];
  const sp = await searchParams;
  const failed = failureOf(sp.error); // a known code only: never echo the query string
  const byId = new Map<string, AttackStatus>(statuses.map((x) => [x.id, x]));

  return (
    <RailShell current="review" me={name ? { name } : undefined}>
      <main className={s.page}>
        <header>
          <h1 className={s.h1}>Demo tools</h1>
          <p className={s.sub}>
            Four pickings staged by the demo seed and signed by a seeded phone. Each one goes through the same checks as any picking from a phone. Demo data only.
          </p>
        </header>
        {!manifest ? (
          <p className={s.sub} data-testid="demo-not-staged">
            Nothing is staged. Run <code>NODE_ENV=development pnpm seed --reset</code> first (only the seed needs NODE_ENV; <code>pnpm demo</code> seeds its own server and needs none).
          </p>
        ) : (
          <section aria-labelledby="demo-attacks">
            <h2 id="demo-attacks" className={s.section}>
              Demo attacks
            </h2>
            <ul className={s.list} aria-label="Staged attacks">
              {manifest.attacks.map((a) => {
                const st = byId.get(a.id)?.submitted ?? null;
                return (
                  <GlassCard as="li" key={a.id} id={`attack-${a.id}`} data-testid={`attack-${a.id}`} className={s.card}>
                    <h3 className={s.title}>{a.title}</h3>
                    <p className={s.muted}>{a.story}</p>
                    <p className={s.muted}>
                      Should be caught by: {CHECK_NAMES[a.expected.check] ?? a.expected.check} ({verdictWord(a.expected.verdict)})
                    </p>
                    {st ? (
                      <div className={s.result} data-testid="attack-result">
                        {/* The shared chip: the D5 word with its mark (DES-112); the system state stays in data-verdict. */}
                        <span className={s.chip}>
                          <VerdictChip verdict={st.verdict} />
                        </span>
                        {st.catching ? (
                          <p className={s.evidence} data-testid="attack-evidence" data-check={st.catching.id}>
                            {CHECK_NAMES[st.catching.id] ?? st.catching.id}: {st.catching.evidence}
                          </p>
                        ) : null}
                        <Link className={s.link} href={`/admin/review/${encodeURIComponent(st.runId)}`}>
                          Open its review
                        </Link>
                      </div>
                    ) : (
                      <form className={s.form} action={submitAttackForm}>
                        <input type="hidden" name="attack" value={a.id} />
                        <Pill type="submit" variant="ghost">
                          Submit {a.title.toLowerCase()}
                        </Pill>
                        {failed && sp.sent === a.id ? (
                          <p className={s.muted} role="alert">
                            Not sent ({failed}). Run <code>NODE_ENV=development pnpm seed --reset</code> and try again.
                          </p>
                        ) : null}
                      </form>
                    )}
                  </GlassCard>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </RailShell>
  );
}

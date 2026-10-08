import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHECK_GROUPS, type GroupKey } from '../../../../../components/field/check-groups';
import { DetailThumb } from '../../../../../components/field/DetailThumb';
import { istDayTime } from '../../../../../components/field/format';
import { kg1 } from '../../../../../lib/format';
import { Ic } from '../../../../../components/field/icons';
import { EvidenceList, type Bubble } from '../../../../../components/ui/EvidenceList';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import { TabBar } from '../../../../../components/ui/TabBar';
import { VerdictChip, VerdictMark, type MarkKind } from '../../../../../components/ui/VerdictChip';
import { getDbReady } from '../../../../../lib/db/client';
import { getPickingDetail, type PickingDetail } from '../../../../../lib/db/queries/picking-detail';
import { t, type MessageKey } from '../../../../../lib/i18n';
import type { CheckStatus, Verdict } from '../../../../../lib/verification/types';
import { requireSession } from '../../../../_auth/require';
import { langFromCookies, throwIfForced } from '../../route-state';

// /field/pickings/[eventId] — one picking (Design.md §5: "each opening its detail: photos, kg, verdict,
// reasons"; no mockup, composed from the ported parts, TP17): Back to Pickings, the verdict chip, the kg
// and plot, when the office received it (IST), the photos (thumbnails for their owner only), up to three
// lines in the farmer's words, and "See all checks" with each of the six groups' state (word + mark).
// Another agent's picking is not found (404). A failure shows the /field error boundary (field/error.tsx).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Picking · Udgam' };

const TONE: Record<Verdict, Bubble> = { Verified: 'ok', 'Needs Review': 'amber', Rejected: 'bad' };
const LABEL: Record<Verdict, MessageKey> = { Verified: 'v.evidence.ok', 'Needs Review': 'v.evidence.check', Rejected: 'v.evidence.bad' };

type GroupState = CheckStatus | 'none';
const WORST: readonly GroupState[] = ['fail', 'flag', 'unavailable', 'ok'];
const MARK: Record<GroupState, MarkKind | null> = { ok: 'ok', flag: 'check', unavailable: 'check', fail: 'bad', none: null };

/** Each farmer-facing group's state: the worst of its checks (fail, then flag, then unavailable), or none when none ran. */
function groupStates(checks: PickingDetail['checks']): { key: GroupKey; state: GroupState }[] {
  const byId = new Map(checks.map((c) => [c.id, c.status]));
  return CHECK_GROUPS.map((g) => {
    const got = g.checks.map((id) => byId.get(id)).filter((s): s is CheckStatus => s !== undefined);
    return { key: g.key, state: got.length === 0 ? 'none' : (WORST.find((w) => got.includes(w as CheckStatus)) ?? 'ok') };
  });
}

export default async function PickingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = await requireSession('agent');
  const { eventId } = await params;
  throwIfForced((await searchParams).state); // dev and e2e only: shows the /field error boundary
  const lang = await langFromCookies();
  const d = await getPickingDetail(await getDbReady(), agent.userId, agent.orgId, eventId, lang);
  if (!d) notFound();

  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const kg = d.cherryKg === null ? tr('pk.noKg') : tr('home.kg', { kg: kg1(d.cherryKg) });
  const groups = groupStates(d.checks);
  return (
    <main className="screen has-tabs" aria-labelledby="dt-h">
      <header className="top">
        <Link className="back" href="/field/pickings">
          <Ic name="arrowLeft" />
          {tr('dt.back')}
        </Link>
      </header>
      <p className="status-row">
        <VerdictChip verdict={d.verdict} lang={lang} />
      </p>
      <h1 className="h1 center" id="dt-h" tabIndex={-1}>
        {tr('dt.title', { kg, plot: d.plotName })}
      </h1>
      <p className="lede center">
        {tr('dt.received')} <time dateTime={d.receivedAt}>{istDayTime(d.receivedAt, lang)}</time>
      </p>

      {d.photos.length > 0 ? (
        <>
          <h2 className="sec-h check-label">{tr('rec.photos.yours')}</h2>
          <ul className="slots" data-testid="detail-photos">
            {d.photos.map((id, i) => (
              <GlassCard as="li" card={false} className="slot" data-state="filled" key={id}>
                <div className="thumb">
                  <DetailThumb src={`/api/media/${encodeURIComponent(id)}/thumb`} missing={tr('dt.photoMissing')} />
                </div>
                <span className="s-name">{tr('dt.photo', { n: i + 1 })}</span>
              </GlassCard>
            ))}
          </ul>
        </>
      ) : null}

      {d.lines.length > 0 ? <EvidenceList tone={TONE[d.verdict]} label={tr(LABEL[d.verdict])} lines={d.lines} /> : null}

      {d.checks.length > 0 ? (
        <GlassCard as="div" card={false} className="row tall all-checks" data-testid="all-checks-card">
          <div className="r-why">
            <details data-testid="all-checks">
              <summary>
                {tr('dt.seeAll')}
                <Ic name="chevron" className="ic chev" />
              </summary>
              <ul className="checks">
                {groups.map((g) => {
                  const mark = MARK[g.state];
                  return (
                    <GlassCard as="li" card={false} key={g.key} data-group={g.key} data-state={g.state}>
                      <span className="c-name">{tr(`grp.${g.key}` as MessageKey, { plot: d.plotName })}</span>
                      <span className="c-state">
                        {mark ? <VerdictMark kind={mark} /> : null}
                        {tr(`dt.state.${g.state}` as MessageKey)}
                      </span>
                    </GlassCard>
                  );
                })}
              </ul>
            </details>
          </div>
        </GlassCard>
      ) : null}

      <TabBar current="pickings" lang={lang} />
    </main>
  );
}

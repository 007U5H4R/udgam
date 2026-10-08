import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReviewDetail } from '../../../../../../components/admin/ReviewDetail';
import { getDbReady } from '../../../../../../lib/db/client';
import { errFields, log } from '../../../../../../lib/log';
import { getReviewDetail, type ReviewDetail as Detail } from '../../../../../../lib/review/detail';
import { listReviewQueue, reviewHeader, type ReviewQueue } from '../../../../../../lib/review/queue';
import { requireSession } from '../../../../../_auth/require';
import { forcedState, ReviewScreen } from '../../ReviewScreen';
import { pageTitle } from '../../../../../../lib/page-title';

// /admin/review/[runId] — one picking's review detail beside the queue (TSK-12.3, TC-054): score with the
// scale and the cap reasons, plot card, photos, all 12 checks with their evidence, and the decision area
// (TSK-12.4/12.6). Another organisation's run is a 404, exactly like an unknown one (EVAL-080).
export const dynamic = 'force-dynamic';
// DES-110: "<Screen> <ID> · Udgam", so two tabs or history entries can be told apart.
export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }): Promise<Metadata> {
  return { title: pageTitle('Review', (await params).runId) };
}

type Props = { params: Promise<{ runId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function ReviewRunPage(props: Props) {
  const admin = await requireSession('admin');
  const { runId } = await props.params;
  const forced = forcedState((await props.searchParams)?.state);

  let queue: ReviewQueue | null = null;
  let detail: Detail | null = null;
  let names: { orgName: string | null; adminName: string | null } = { orgName: null, adminName: null };
  let failed = false;
  if (forced !== 'loading' && forced !== 'error') {
    try {
      const db = await getDbReady();
      [queue, detail, names] = await Promise.all([listReviewQueue(db, admin.orgId), getReviewDetail(db, admin.orgId, runId), reviewHeader(db, admin.orgId, admin.userId)]);
    } catch (err) {
      failed = true;
      log.error(errFields(err), 'review.detail_load_failed');
    }
    if (!failed && !detail) notFound();
  }
  const state = forced ?? (failed || queue === null ? 'error' : 'working');
  const rest = (queue?.waiting ?? []).filter((i) => i.runId !== runId);
  return (
    <ReviewScreen
      state={state}
      queue={state === 'empty' ? null : queue}
      orgName={names.orgName}
      adminName={names.adminName}
      current={runId}
      detail={detail ? <ReviewDetail d={detail} adminName={names.adminName ?? 'this admin'} next={rest[0] ? { runId: rest[0].runId, left: rest.length } : null} /> : null}
    />
  );
}

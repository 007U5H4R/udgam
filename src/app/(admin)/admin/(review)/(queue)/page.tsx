import type { Metadata } from 'next';
import { getDbReady } from '../../../../../lib/db/client';
import { log } from '../../../../../lib/log';
import { errFields } from '../../../../_log/err-fields';
import { listReviewQueue, reviewHeader, type ReviewQueue } from '../../../../../lib/review/queue';
import { requireSession } from '../../../../_auth/require';
import { forcedState, PickAnItem, ReviewScreen } from '../ReviewScreen';

// /admin — the review queue (TSK-12.2, TC-054, EVAL-088 admin), ported from final/admin.html: the
// organisation's Needs Review pickings, oldest first, and the hard-failed ones "Not accepted by the
// checks". At ≥ 1100 px the detail column says "Pick an item"; below that the list stands alone.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review · Udgam' };

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function ReviewPage(props: Props = {}) {
  const admin = await requireSession('admin');
  const forced = forcedState((await props.searchParams)?.state);

  let queue: ReviewQueue | null = null; // null: failed to load
  let names: { orgName: string | null; adminName: string | null } = { orgName: null, adminName: null };
  if (forced !== 'loading' && forced !== 'error') {
    try {
      const db = await getDbReady();
      [queue, names] = await Promise.all([listReviewQueue(db, admin.orgId), reviewHeader(db, admin.orgId, admin.userId)]);
    } catch (err) {
      log.error(errFields(err), 'review.queue_load_failed');
    }
  }
  const state = forced ?? (queue === null ? 'error' : queue.waiting.length === 0 && queue.final.length === 0 ? 'empty' : 'working');
  return <ReviewScreen state={state} queue={state === 'empty' ? null : queue} orgName={names.orgName} adminName={names.adminName} detail={<PickAnItem />} />;
}

import type { ReactNode } from 'react';
import { QueueList, type QueueState } from '../../../../components/admin/QueueList';
import { RailShell } from '../../../../components/ui/Rail';
import { env } from '../../../../lib/config/env';
import type { ReviewQueue } from '../../../../lib/review/queue';
import '../../../../styles/admin.css';

// The review screen layout (TSK-12.2), shared by /admin and /admin/review/[runId]: TKT-05's rail (with
// the waiting count on Review) beside admin.html's `.main` — the queue column and the detail column. At
// ≥ 1100 px both columns show side by side; below that /admin is the list alone and a detail URL is the
// detail alone with a Back button (`detail-open`). Each page renders one of the four states (§11).

/** `?state=loading|empty|error` renders that state in dev and e2e builds only (technical-plan §11). */
export function forcedState(v: unknown): Exclude<QueueState, 'working'> | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return v === 'loading' || v === 'empty' || v === 'error' ? v : null;
}

export function ReviewScreen({
  state,
  queue,
  orgName,
  adminName,
  current,
  detail,
}: {
  state: QueueState;
  queue: ReviewQueue | null;
  orgName: string | null;
  adminName: string | null;
  /** The open item's run (a detail URL). */
  current?: string;
  /** The detail column in the working state. */
  detail?: ReactNode;
}) {
  const open = current !== undefined && state === 'working';
  return (
    <RailShell current="review" me={adminName ? { name: adminName } : undefined} reviewCount={state === 'working' ? queue?.waiting.length : undefined}>
      <main className={`review${open ? ' detail-open' : ''}`} data-state={state} id="main">
        <QueueList
          state={state}
          queue={queue}
          orgName={orgName}
          current={current}
        />
        {state === 'loading' ? <DetailSkeleton /> : state === 'working' ? detail : null}
      </main>
    </RailShell>
  );
}

/** The detail column before an item is chosen (≥ 1100 px; below that the list stands alone). */
export function PickAnItem() {
  return (
    <section className="detail" aria-label="Picking detail">
      <div className="d-body d-pick">
        <p>Pick an item to see its photos, plot and all 12 checks.</p>
      </div>
    </section>
  );
}

/** admin.html's detail skeleton (loading). */
export function DetailSkeleton() {
  return (
    <section className="detail" aria-hidden="true">
      <div className="d-body">
        <div className="d-sk">
          <span className="sk m" />
          <span className="sk h" />
          <span className="sk box" />
          <span className="sk box2" />
        </div>
      </div>
    </section>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { VerdictMark } from '../ui/VerdictChip';
import pill from '../ui/Pill.module.css';
import { istDay, waited, type QueueIcon } from '../../lib/review/copy';
import { kg1 } from '../../lib/format';
import type { QueueItem, ReviewQueue } from '../../lib/review/queue';

// The review queue column (TSK-12.2), ported from final/admin.html lines 450–490: the heading with the
// lit count, the waiting list (oldest first), "Not accepted by the checks (n)" with its note, and the
// loading (skeleton rows + note), empty ("Nothing to check.") and error (what happened · nothing was
// changed · Try again) states. Server-rendered: each row is a link to its detail.

/** The admin icon set (admin.html <symbol>s, 24 grid, 1.8 stroke). */
const PATHS: Record<QueueIcon | 'ring' | 'retry' | 'wifiOff' | 'arrowLeft' | 'arrowRight' | 'check' | 'x' | 'lock' | 'seal' | 'location', ReactNode> = {
  inbox: (
    <>
      <path d="M3.5 13.5h4.6l1.5 2.5h4.8l1.5-2.5h4.6" />
      <path d="M6 5h12l2.5 8.5V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-4.5z" />
    </>
  ),
  plot: <path d="M5 7.5 11 4l8 3-1.5 9L10 20l-5.5-4z" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.3" r="3.4" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  cloud: <path d="M7.5 18.5h9.6a4 4 0 0 0 .5-7.96A5.5 5.5 0 0 0 7 9.7a4.4 4.4 0 0 0 .5 8.8z" />,
  location: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  trend: (
    <>
      <path d="M4 17l5-5 3.5 3.5L20 8" />
      <path d="M15 8h5v5" />
    </>
  ),
  seal: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z" />
      <path d="M9 12l2.2 2.2L15.3 10" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </>
  ),
  ring: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.6 16.1a5 5 0 0 1 6-.5" />
      <path d="M5.3 12.7a9.6 9.6 0 0 1 4.2-2.2" />
      <path d="M14 10.5a9.6 9.6 0 0 1 4.8 2.3" />
      <path d="M2 9.3a14.4 14.4 0 0 1 3.3-2.2" />
      <path d="M9.7 5.2A14.4 14.4 0 0 1 22 9.3" />
      <path d="M12 19.6h.01" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'ic' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** admin.html mk-na: a dashed circle with a dash ("Couldn't run"). */
export function NaMark({ className = 'mk' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark="na">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#F3F6F4" strokeWidth="1.8" strokeDasharray="3 2.6" />
      <path d="M8 12h8" stroke="#F3F6F4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Row({ item, current, now, bad }: { item: QueueItem; current: boolean; now: Date; bad: boolean }) {
  return (
    <li>
      <Link className="q-item" href={`/admin/review/${encodeURIComponent(item.runId)}`} aria-current={current ? 'true' : 'false'} data-run={item.runId}>
        <span className={`q-bub${bad ? ' bad' : ''}`}>
          <Icon name={item.icon} />
        </span>
        <span className="q-id">
          {item.producerId} · {item.plotName}
        </span>
        <span className="q-kg">{kg1(item.cherryKg)} kg</span>
        <span className="q-when">
          {istDay(item.receivedAt)}
          {bad ? '' : ` · waiting ${waited(item.receivedAt, now)}`}
        </span>
        <span className={`q-why${bad ? ' bad' : ''}`}>
          <VerdictMark kind={bad ? 'bad' : 'check'} />
          <span>
            {bad ? 'Not accepted · ' : ''}
            {item.headline}
            {bad ? '' : ` · score ${item.score}`}
          </span>
        </span>
      </Link>
    </li>
  );
}

export type QueueState = 'working' | 'loading' | 'empty' | 'error';

/** The queue column. `current` marks the open item; `orgName` is the eyebrow's organisation. */
export function QueueList({
  state,
  queue,
  orgName,
  current,
  now = new Date(),
  signOut,
}: {
  state: QueueState;
  queue: ReviewQueue | null;
  orgName: string | null;
  current?: string;
  now?: Date;
  /** The sign-out form (the admin's only sign-out; the rail has none). */
  signOut?: ReactNode;
}) {
  const waiting = queue?.waiting ?? [];
  const final = queue?.final ?? [];
  return (
    <section className="queue" aria-labelledby="q-h">
      <span className="q-brand">
        <Image src="/brand/cherry.svg" alt="" width={36} height={36} unoptimized />
        Udgam
      </span>
      <header className="q-head">
        <p className="eyebrow">{orgName ? `${orgName} · Review` : 'Review'}</p>
        <h1 id="q-h" tabIndex={-1}>
          {state === 'working' ? (
            <>
              <span className="lit">{waiting.length}</span>{' '}
            </>
          ) : null}
          Pickings to check
        </h1>
        {state === 'working' ? (
          <p className="q-sub">{waiting.length ? 'Oldest first. The checks ran on their own; these need a person to look.' : 'All done for now.'}</p>
        ) : null}
      </header>

      {state === 'working' ? (
        <div>
          <ul className="q-list" aria-label="Waiting for a person">
            {waiting.length ? (
              waiting.map((i) => <Row key={i.runId} item={i} current={i.runId === current} now={now} bad={false} />)
            ) : (
              <li className="glass card q-done">
                <p>
                  <b>Nothing to check.</b>
                </p>
                <p>New items appear here when a picking needs a person to look.</p>
              </li>
            )}
          </ul>
          {final.length ? (
            <>
              <h2 className="q-sec" id="final-h">
                Not accepted by the checks <span>({final.length})</span>
              </h2>
              <p className="q-sec-note">Shown so you can answer the farmer. These can&apos;t be changed.</p>
              <ul className="q-list" aria-labelledby="final-h">
                {final.map((i) => (
                  <Row key={i.runId} item={i} current={i.runId === current} now={now} bad />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {state === 'loading' ? (
        <div aria-busy="true">
          <p className="load-note" role="status">
            <Icon name="ring" />
            Loading the review list…
          </p>
          <ul className="q-list" aria-hidden="true">
            {[
              [62, 44, 78],
              [58, 40, 70],
              [64, 46, 74],
              [55, 42, 66],
            ].map((w, i) => (
              <li key={i} className="glass sk-row">
                <span className="sk" />
                {w.map((pct, j) => (
                  <span key={j} className="sk sk-line" style={{ width: `${pct}%` }} />
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className="glass card state-card" data-testid="queue-empty">
          <div className="cherry" aria-hidden="true">
            <Image src="/brand/cherry.svg" alt="" width={112} height={112} unoptimized />
          </div>
          <h2>Nothing to check.</h2>
          <p>New items appear here when a picking needs a person to look.</p>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="glass card state-card err" role="alert">
          <div className="st-ic" aria-hidden="true">
            <Icon name="wifiOff" />
          </div>
          <h2>Couldn&apos;t load the review list.</h2>
          <p>Nothing was changed.</p>
          <RetryLink />
        </div>
      ) : null}

      {signOut ? <div className="q-foot">{signOut}</div> : null}
    </section>
  );
}

/** "Try again" as a link that reloads the review list (a server-rendered error has no client state). */
function RetryLink() {
  return (
    <a className={`${pill.pill} ${pill.amber} pill-link`} href="/admin">
      <Icon name="retry" />
      Try again
    </a>
  );
}

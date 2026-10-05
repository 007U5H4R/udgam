import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, NaMark } from '../../../components/admin/QueueList';
import { Pill } from '../../../components/ui/Pill';
import { RailShell } from '../../../components/ui/Rail';
import { VerdictMark } from '../../../components/ui/VerdictChip';
import { env } from '../../../lib/config/env';
import { COPY, cropName, istShort, kg1, rowStatus, type RowStatus } from '../../../lib/processing/copy';
import type { ProcessorBatch } from '../../../lib/processing/read';
import { signOut } from '../../(public)/sign-in/actions';
import { ErrorCard } from './ErrorCard';
import '../../../styles/admin.css';
import './processor.css';

// The processor surface (TKT-26, TSK-26.5), ported from contract.html screen 6: the admin rail component
// with one item (Batches; hidden on phones, Design.md §28.2), the list of batches handed to this processor
// and the detail column. At ≥ 1100 px list and detail sit side by side; below that /processor is the list
// alone and a detail URL is the detail alone with a Back link (admin.html's `detail-open`). Each page
// renders one of the four states (§28.6, technical-plan §11).

export type ScreenState = 'working' | 'loading' | 'empty' | 'error';

/** `?state=loading|empty|error` renders that state in dev and e2e builds only (technical-plan §11). */
export function forcedState(v: unknown): Exclude<ScreenState, 'working'> | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return v === 'loading' || v === 'empty' || v === 'error' ? v : null;
}

/** A status mark: ok (circle ✓), check (diamond !) or the neutral dashed mk-na (§28.7). */
export function StatusMark({ cls }: { cls: RowStatus['cls'] }) {
  return cls === 'na' ? <NaMark /> : <VerdictMark kind={cls} />;
}

function Row({ b, current }: { b: ProcessorBatch; current: boolean }) {
  const s = rowStatus(b);
  const bub = s.cls === 'check' ? '' : s.cls;
  return (
    <li>
      <Link className="q-item" href={`/processor/batches/${encodeURIComponent(b.batchId)}`} aria-current={current ? 'true' : 'false'} data-batch={b.batchId}>
        <span className={`q-bub ${bub}`}>
          <BoxIcon />
        </span>
        <span className="q-id">
          {b.batchId} · {cropName(b.crop)}
        </span>
        <span className="q-kg">{kg1(b.quantityKg)} kg</span>
        <span className="q-when">
          From {b.fromOrgName} · {istShort(b.receivedAt)}
        </span>
        <span className={`q-why ${bub}`}>
          <StatusMark cls={s.cls} />
          <span>{s.text}</span>
        </span>
      </Link>
    </li>
  );
}

/** admin.html i-box (the Batches rail icon). */
export function BoxIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </svg>
  );
}

function BatchQueue({ state, batches, orgName, current }: { state: ScreenState; batches: ProcessorBatch[]; orgName: string | null; current?: string }) {
  const live = state === 'working';
  const held = batches.filter((b) => b.held).length;
  return (
    <section className="queue" aria-labelledby="q-h">
      <span className="q-brand">
        <Image src="/brand/cherry.svg" alt="" width={36} height={36} unoptimized />
        Udgam
      </span>
      <header className="q-head">
        <p className="eyebrow">{orgName ?? 'Processor'}</p>
        <h1 id="q-h" tabIndex={-1}>
          {live ? (
            <>
              <span className="lit">{held}</span>{' '}
            </>
          ) : null}
          {COPY.title}
        </h1>
        {live ? <p className="q-sub">{COPY.sub}</p> : null}
      </header>

      {live ? (
        <ul className="q-list" aria-label={COPY.title}>
          {batches.map((b) => (
            <Row key={b.batchId} b={b} current={b.batchId === current} />
          ))}
        </ul>
      ) : null}

      {state === 'loading' ? (
        <div aria-busy="true">
          <p className="load-note" role="status">
            <Icon name="ring" />
            {COPY.loading}
          </p>
          <ul className="q-list" aria-hidden="true">
            {[62, 58, 64].map((w, i) => (
              <li key={i} className="glass sk-row">
                <span className="sk" />
                <span className="sk sk-line" style={{ width: `${w}%` }} />
                <span className="sk sk-line" style={{ width: `${w - 18}%` }} />
                <span className="sk sk-line" style={{ width: `${w + 10}%` }} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className="glass card state-card" data-testid="processor-empty">
          <div className="cherry" aria-hidden="true">
            <Image src="/brand/cherry.svg" alt="" width={112} height={112} unoptimized />
          </div>
          <h2>{COPY.emptyH}</h2>
          <p>{COPY.emptyP}</p>
        </div>
      ) : null}

      {state === 'error' ? <ErrorCard /> : null}

      <div className="q-foot">
        <form action={signOut}>
          <Pill variant="ghost" type="submit">
            {COPY.signOut}
          </Pill>
        </form>
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

/** The detail column before a batch is chosen (≥ 1100 px; below that the list stands alone). */
export function PickABatch() {
  return (
    <section className="detail" aria-label="Batch detail">
      <div className="d-body d-pick">
        <p>{COPY.pick}</p>
      </div>
    </section>
  );
}

export function ProcessorScreen({
  state,
  batches,
  orgName,
  userName,
  current,
  detail,
}: {
  state: ScreenState;
  batches: ProcessorBatch[];
  orgName: string | null;
  userName: string | null;
  current?: string;
  detail?: ReactNode;
}) {
  const open = current !== undefined && state === 'working';
  return (
    <RailShell
      className="proc-shell"
      current="batches"
      items={[{ id: 'batches', href: '/processor' }]}
      label={COPY.railLabel}
      roleLabel={orgName ?? undefined}
      me={userName ? { name: userName } : undefined}
    >
      <main className={`review proc${open ? ' detail-open' : ''}`} data-state={state} id="main">
        <BatchQueue state={state} batches={batches} orgName={orgName} current={current} />
        {state === 'loading' ? <DetailSkeleton /> : state === 'working' ? detail : null}
      </main>
    </RailShell>
  );
}

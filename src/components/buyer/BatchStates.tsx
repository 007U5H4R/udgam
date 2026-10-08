import type { ReactNode } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Icon } from './Icon';
import s from './BatchScreen.module.css';

// The loading, empty and error states of the batch lists (technical-plan §11, Design.md §18): a
// skeleton (never a spinner alone), an empty card that says what fills it, and an error card that says
// what happened, that nothing was lost, and what to do. Ported from admin.html's state panels.

/** Skeleton rows under a "Loading…" line. */
export function ListLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" data-state="loading">
      <p className={s.loadNote} role="status">
        <Icon name="ring" />
        {label}
      </p>
      <ul className={s.list} aria-hidden="true">
        {[62, 58, 64, 55].map((w) => (
          <li key={w} className={s.skRow}>
            <span className={s.sk} />
            <span className={`${s.sk} ${s.skLine}`} style={{ width: `${w}%` }} />
            <span className={`${s.sk} ${s.skLine}`} style={{ width: `${w - 18}%` }} />
            <span className={`${s.sk} ${s.skLine}`} style={{ width: `${w + 14}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty or error card. The error card uses the amber tint and the "no connection" icon. */
export function StateCard({ kind, title, body, action }: { kind: 'empty' | 'error'; title: string; body: string; action?: ReactNode }) {
  return (
    <GlassCard className={`${s.stateCard} ${kind === 'error' ? s.err : ''}`} role={kind === 'error' ? 'alert' : undefined} data-state={kind}>
      {kind === 'error' ? (
        <div className={s.stIc} aria-hidden="true">
          <Icon name="wifiOff" />
        </div>
      ) : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </GlassCard>
  );
}

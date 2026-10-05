'use client';

import { useActionState, type ReactNode } from 'react';
import type { ActionState } from '../../lib/agreements/actions';
import { Icon } from '../admin/QueueList';
import { Pill } from '../ui/Pill';
import { InlineErrView } from './client-parts';

// One signed action in a decide panel (Design.md §28.5–§28.6, admin.html `.decide`): fund, take the
// money back, settle. While it runs the pill is disabled with the spinning ring and its own words; if it
// does not go through, an inline error above the note says nothing moved and the pill becomes Try
// again. A failure is never shown as a result. `forcedWorking` renders the working state for e2e
// (`?state=working`, dev and E2E builds only).

export type ActionTexts = {
  idle: string;
  busy: string;
  retry: string;
  /** Inline error per failure kind. */
  noAnswer: { title: string; body: string };
  turnedAway?: { title: string; body: string };
  /** A status line shown while working (settle). */
  workingLine?: string;
};

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  texts: ActionTexts;
  forcedWorking?: boolean;
  /** `decide`: the panel with heading and note (fund, refund). `bar`: the sticky settle bar under the detail. */
  layout: 'decide' | 'bar';
  heading?: { id: string; text: string };
  /** Server-rendered content between the heading and the error (decide), or above the bar (bar). */
  children?: ReactNode;
  note?: ReactNode;
  hint?: string;
  icon?: 'check' | 'arrowLeft';
};

export function ActionPanel({ action, hidden, texts, forcedWorking, layout, heading, children, note, hint, icon = 'check' }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const pending = isPending || !!forcedWorking;
  const failed = !pending ? state.failure : undefined;
  const err = failed === 'turned_away' && texts.turnedAway ? texts.turnedAway : texts.noAnswer;

  const pill = (
    <Pill type="submit" disabled={pending} aria-busy={pending ? 'true' : undefined} data-testid="action-pill" icon={<Icon name={pending ? 'ring' : failed ? 'retry' : icon} className={pending ? 'ic spin' : 'ic'} />}>
      {pending ? texts.busy : failed ? texts.retry : texts.idle}
    </Pill>
  );
  const inputs = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  if (layout === 'bar') {
    return (
      <form action={formAction} noValidate>
        {inputs}
        <div className="d-body" style={{ paddingTop: 0 }}>
          {pending && texts.workingLine ? (
            <p className="load-note" role="status" data-state="working">
              <Icon name="ring" />
              {texts.workingLine}
            </p>
          ) : null}
          {failed ? <InlineErrView title={err.title} body={err.body} /> : null}
          {children}
        </div>
        <div className="d-actions">
          {pill}
          {hint ? <p className="again-hint" style={{ textAlign: 'left' }}>{hint}</p> : null}
        </div>
      </form>
    );
  }
  return (
    <form className="decide" action={formAction} noValidate aria-labelledby={heading?.id} data-state={pending ? 'working' : failed ? 'action-error' : 'data'}>
      {inputs}
      {heading ? <h3 id={heading.id}>{heading.text}</h3> : null}
      {children}
      {failed ? <InlineErrView title={err.title} body={err.body} /> : null}
      {note}
      {pill}
    </form>
  );
}

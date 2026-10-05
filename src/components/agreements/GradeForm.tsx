'use client';

import { startTransition, useActionState, useRef, useState, type FormEvent } from 'react';
import type { ActionState } from '../../lib/agreements/actions';
import { FIELD_MESSAGES } from '../../lib/agreements/format';
import { GRADES, gradeDisplay, parseGrade } from '../../lib/agreements/grades';
import { t } from '../../lib/i18n';
import { Icon } from '../admin/QueueList';
import { Pill } from '../ui/Pill';
import { FieldCheck, InlineErrView } from './client-parts';

// Grade a delivered batch (Design.md §28.1 screen 4, final/contract.html "buyer-grade"): five native
// radios in 52 px option rows; grades below the agreed minimum are marked before signing. The field check
// sits under the legend and the fieldset's aria-describedby names it; each radio carries aria-invalid.

export function GradeForm({
  action,
  agreementId,
  batchId,
  minGrade,
  forcedWorking,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  agreementId: string;
  batchId: string;
  minGrade: number;
  forcedWorking?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [chosen, setChosen] = useState<string>('');
  const [clientError, setClientError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const pending = isPending || !!forcedWorking;
  const message = clientError ?? state.fieldErrors?.grade;
  const failed = !pending && !message ? state.failure : undefined;
  const g = parseGrade(chosen);

  // Submitted by hand (not through <form action>), so React does not reset the form afterwards: after an
  // action error the chosen grade stays selected (§28.6).
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (parseGrade(chosen) === null) {
      setClientError(FIELD_MESSAGES.gradeNeeded);
      e.currentTarget.querySelector<HTMLInputElement>('input[name="grade"]')?.focus();
      return;
    }
    setClientError(null);
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <form ref={ref} className="decide" onSubmit={onSubmit} noValidate aria-labelledby="gr-h" data-state={pending ? 'working' : failed ? 'action-error' : message ? 'field-check' : 'data'}>
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="batchId" value={batchId} />
      <h3 id="gr-h">{t('agreements.grade.title', { batch: batchId })}</h3>
      <div className="field">
        <fieldset aria-describedby={message ? 'gr-e gr-n' : 'gr-n'}>
          <legend>{t('agreements.grade.legend')}</legend>
          <FieldCheck id="gr-e" message={message} />
          <div className="opts">
            {GRADES.map(({ label, value }) => (
              <label className="opt" key={value}>
                {/* Design.md §28.7 asks for aria-invalid on each radio as well as the fieldset's message. */}
                {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
                <input
                  type="radio"
                  name="grade"
                  value={String(value)}
                  checked={chosen === String(value)}
                  onChange={(e) => {
                    setChosen(e.target.value);
                    setClientError(null);
                  }}
                  aria-invalid={message ? 'true' : undefined}
                  disabled={pending}
                />
                <span className="o-txt">
                  {label}
                  {value === minGrade ? <span>{t('agreements.grade.atMin')}</span> : value < minGrade ? <span>{t('agreements.grade.belowMin')}</span> : null}
                </span>
                <span className="o-num">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="hint" id="gr-n">
        {t('agreements.grade.hint', { min: gradeDisplay(minGrade as (typeof GRADES)[number]['value']) })}
      </p>
      {failed ? <InlineErrView title={t('agreements.grade.errTitle')} body={t('agreements.grade.errBody')} /> : null}
      <p className="dec-note">
        <Icon name="seal" />
        <span>{t('agreements.grade.note')}</span>
      </p>
      <Pill type="submit" disabled={pending} aria-busy={pending ? 'true' : undefined} data-testid="action-pill" icon={<Icon name={pending ? 'ring' : failed ? 'retry' : 'check'} className={pending ? 'ic spin' : 'ic'} />}>
        {pending ? t('agreements.grade.busy') : failed ? t('agreements.retry') : g !== null ? t('agreements.grade.sign', { grade: gradeDisplay(g) }) : t('agreements.grade.idle')}
      </Pill>
    </form>
  );
}

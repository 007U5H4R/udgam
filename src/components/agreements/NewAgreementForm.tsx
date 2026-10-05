'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ActionState } from '../../lib/agreements/actions';
import { amountHint, deadlineHint } from '../../lib/agreements/format';
import { checkNewAgreement, NEW_AGREEMENT_ORDER, type NewAgreementField, type NewAgreementFields } from '../../lib/agreements/form';
import { GRADES, gradeDisplay } from '../../lib/agreements/grades';
import { t } from '../../lib/i18n';
import { Icon } from '../admin/QueueList';
import { Pill } from '../ui/Pill';
import { describedBy, FieldCheck, InlineErrView } from './client-parts';

// New agreement (Design.md §28.1 screen 2, final/contract.html "buyer-new"). Fields show exactly what
// was typed (no grouping while typing); the amount and deadline hints read the value back in display
// form. Fields are checked on submit with the same rules and words as the server (§28.7): a field that
// needs a change gets aria-invalid and a message linked by aria-describedby (message first, then hint),
// and focus moves to the first one. Every value is kept as typed. Working and action error per §28.6.

const ID: Record<NewAgreementField, string> = { fpo: 'f-fpo', crop: 'f-crop', kg: 'f-kg', minGrade: 'f-min', amount: 'f-amt', deadline: 'f-by' };

export function NewAgreementForm({
  action,
  fpos,
  forcedWorking,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fpos: { id: string; name: string }[];
  forcedWorking?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [values, setValues] = useState<NewAgreementFields>({ fpo: fpos[0]?.id ?? '', crop: 'arabica', kg: '', minGrade: '', amount: '', deadline: '' });
  const [clientErrors, setClientErrors] = useState<Partial<Record<NewAgreementField, string>> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = isPending || !!forcedWorking;
  const errors = clientErrors ?? (state.fieldErrors as Partial<Record<NewAgreementField, string>> | undefined) ?? {};
  const failed = !pending && !clientErrors ? state.failure : undefined;

  // The server answered with field checks (a request that skipped the browser's check): focus the first.
  useEffect(() => {
    const first = NEW_AGREEMENT_ORDER.find((f) => state.fieldErrors?.[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${ID[first]}`)?.focus();
  }, [state]);

  const set = (f: NewAgreementField) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setValues((cur) => ({ ...cur, [f]: v }));
    // a message clears once the field holds an accepted value
    if (clientErrors?.[f]) {
      const next = checkNewAgreement({ ...values, [f]: v }, fpos.map((x) => x.id));
      if (next.ok || !next.errors[f]) setClientErrors((cur) => ({ ...cur, [f]: undefined }));
    }
  };

  // Submitted by hand (not through <form action>), so React does not reset the fields afterwards: every
  // value stays as typed after a field check or an action error (§28.6–§28.7).
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const check = checkNewAgreement(values, fpos.map((x) => x.id));
    if (!check.ok) {
      setClientErrors(check.errors);
      const first = NEW_AGREEMENT_ORDER.find((f) => check.errors[f]);
      if (first) e.currentTarget.querySelector<HTMLElement>(`#${ID[first]}`)?.focus();
      return;
    }
    setClientErrors(null);
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  const field = (f: NewAgreementField, hint?: string) => ({
    id: ID[f],
    name: f,
    'aria-invalid': errors[f] ? ('true' as const) : undefined,
    'aria-describedby': describedBy(ID[f], !!errors[f], !!hint),
    disabled: pending,
  });

  const amtHint = amountHint(values.amount);
  const byHint = deadlineHint(values.deadline);

  return (
    <form ref={formRef} className="glass card form-card" onSubmit={onSubmit} noValidate aria-labelledby="d-h" data-state={pending ? 'working' : failed ? 'action-error' : Object.keys(errors).some((k) => errors[k as NewAgreementField]) ? 'field-check' : 'data'}>
      <div className="f-row">
        <div className="field">
          <label htmlFor={ID.fpo}>{t('agreements.new.with')}</label>
          <select {...field('fpo')} value={values.fpo} onChange={set('fpo')}>
            {fpos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <FieldCheck id={`${ID.fpo}-e`} message={errors.fpo} />
        </div>
        <div className="field">
          <label htmlFor={ID.crop}>{t('agreements.terms.crop')}</label>
          <select {...field('crop')} value={values.crop} onChange={set('crop')}>
            <option value="arabica">{t('agreements.crop.arabica')}</option>
            <option value="robusta">{t('agreements.crop.robusta')}</option>
          </select>
          <FieldCheck id={`${ID.crop}-e`} message={errors.crop} />
        </div>
      </div>
      <div className="f-row">
        <div className="field">
          <label htmlFor={ID.kg}>{t('agreements.new.kg')}</label>
          <input {...field('kg', 'h')} type="text" inputMode="decimal" autoComplete="off" value={values.kg} onChange={set('kg')} />
          <FieldCheck id={`${ID.kg}-e`} message={errors.kg} />
          <p className="hint" id={`${ID.kg}-h`}>
            {t('agreements.new.kgHint')}
          </p>
        </div>
        <div className="field">
          <label htmlFor={ID.minGrade}>{t('agreements.terms.minGrade')}</label>
          <select {...field('minGrade', 'h')} value={values.minGrade} onChange={set('minGrade')}>
            {values.minGrade === '' ? <option value="">{t('agreements.new.chooseGrade')}</option> : null}
            {GRADES.map((g) => (
              <option key={g.value} value={String(g.value)}>
                {gradeDisplay(g.value)}
              </option>
            ))}
          </select>
          <FieldCheck id={`${ID.minGrade}-e`} message={errors.minGrade} />
          <p className="hint" id={`${ID.minGrade}-h`}>
            {t('agreements.new.gradeHint')}
          </p>
        </div>
      </div>
      <div className="f-row">
        <div className="field">
          <label htmlFor={ID.amount}>{t('agreements.new.amount')}</label>
          <input {...field('amount', 'h')} type="text" inputMode="decimal" autoComplete="off" value={values.amount} onChange={set('amount')} />
          <FieldCheck id={`${ID.amount}-e`} message={errors.amount} />
          <p className="hint" id={`${ID.amount}-h`} aria-live="polite">
            {amtHint}
          </p>
        </div>
        <div className="field">
          <label htmlFor={ID.deadline}>{t('agreements.terms.deadline')}</label>
          <input {...field('deadline', 'h')} type="date" value={values.deadline} onChange={set('deadline')} />
          <FieldCheck id={`${ID.deadline}-e`} message={errors.deadline} />
          <p className="hint" id={`${ID.deadline}-h`}>
            {byHint}
          </p>
        </div>
      </div>
      {failed ? <InlineErrView title={t('agreements.create.errTitle')} body={t('agreements.create.errBody')} /> : null}
      <p className="dec-note">
        <Icon name="seal" />
        <span>{t('agreements.create.note')}</span>
      </p>
      <Pill type="submit" disabled={pending} aria-busy={pending ? 'true' : undefined} data-testid="action-pill" icon={<Icon name={pending ? 'ring' : failed ? 'retry' : 'check'} className={pending ? 'ic spin' : 'ic'} />}>
        {pending ? t('agreements.create.busy') : failed ? t('agreements.retry') : t('agreements.create.idle')}
      </Pill>
    </form>
  );
}

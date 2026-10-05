'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Icon } from '../../../components/admin/QueueList';
import { Pill } from '../../../components/ui/Pill';
import { VerdictMark } from '../../../components/ui/VerdictChip';
import type { MbCrop, Process } from '../../../lib/processing/config';
import { bandLine, COPY, PROCESS_LABEL, PROCESS_OPTIONS, processHint } from '../../../lib/processing/copy';
import { checkStepFields, type StepField, type StepFieldErrors } from '../../../lib/processing/validate';
import { recordStepAction } from './actions';

// "Record a processing step" (contract.html screen 6, variant form; Design.md §28.6–§28.7). Fields are
// checked when the person submits, not while typing; the server checks again with the same words. A field
// that needs a change gets aria-invalid and its message under it (message first, then the hint, in
// aria-describedby); focus moves to the first one; every value stays as typed. While recording, the pill
// shows its own words and the fields are disabled; if it does not go through, an inline error says nothing
// was signed and keeps what was entered. Output above input is accepted (and flagged as a gain).

const ORDER: StepField[] = ['process', 'inputKg', 'outputKg'];
/** The element that takes focus for each field (the first radio for the process group). */
const FOCUS: Record<StepField, string> = { process: 'p-proc-0', inputKg: 'p-in', outputKg: 'p-out' };

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p className="f-err" id={id}>
      <VerdictMark kind="check" />
      <span>{text}</span>
    </p>
  );
}

const describedBy = (id: string, err: boolean, hint: boolean) => [err ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined;

export function StepForm({ batchId, crop }: { batchId: string; crop: MbCrop }) {
  const router = useRouter();
  const [process, setProcess] = useState<Process | ''>('');
  const [inputKg, setInputKg] = useState('');
  const [outputKg, setOutputKg] = useState('');
  const [errors, setErrors] = useState<StepFieldErrors>({});
  const [actError, setActError] = useState(false);
  const [working, start] = useTransition();

  const show = (errs: StepFieldErrors) => {
    setErrors(errs);
    const first = ORDER.find((f) => errs[f]);
    if (first) requestAnimationFrame(() => document.getElementById(FOCUS[first])?.focus());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (working) return;
    setActError(false);
    const checked = checkStepFields({ process, inputKg, outputKg });
    if (!checked.ok) return show(checked.errors);
    setErrors({});
    start(async () => {
      let r: Awaited<ReturnType<typeof recordStepAction>>;
      try {
        r = await recordStepAction({ batchId, process, inputKg, outputKg });
      } catch {
        setActError(true);
        return;
      }
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.reason === 'fields') show(r.errors);
      else setActError(true);
    });
  };

  // A field's message clears once it holds an accepted value (§28.7).
  const recheck = (next: { process: string; inputKg: string; outputKg: string }) => {
    if (Object.keys(errors).length === 0) return;
    const c = checkStepFields(next);
    const still: StepFieldErrors = {};
    for (const f of ORDER) if (errors[f] && !c.ok && c.errors[f]) still[f] = c.errors[f];
    setErrors(still);
  };

  return (
    <form className="glass card form-card" aria-labelledby="p-h" noValidate onSubmit={submit} aria-busy={working || undefined}>
      <h3 className="sec-h" id="p-h">
        {COPY.recordH}
      </h3>
      <div className="field">
        <fieldset aria-describedby={errors.process ? 'p-proc-e' : undefined}>
          <legend>{COPY.processLegend}</legend>
          <FieldError id="p-proc-e" text={errors.process} />
          <div className="opts">
            {PROCESS_OPTIONS.map((p, i) => (
              <label className="opt" key={p}>
                <input
                  id={`p-proc-${i}`}
                  type="radio"
                  name="process"
                  value={p}
                  checked={process === p}
                  disabled={working}
                  onChange={() => {
                    setProcess(p);
                    recheck({ process: p, inputKg, outputKg });
                  }}
                />
                <span className="o-txt">
                  {PROCESS_LABEL[p]}
                  <span>{processHint(p, crop)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="f-row">
        <div className="field">
          <label htmlFor="p-in">{COPY.inputLabel}</label>
          <input
            id="p-in"
            name="inputKg"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={inputKg}
            disabled={working}
            aria-invalid={errors.inputKg ? true : undefined}
            aria-describedby={describedBy('p-in', !!errors.inputKg, true)}
            onChange={(e) => {
              setInputKg(e.currentTarget.value);
              recheck({ process, inputKg: e.currentTarget.value, outputKg });
            }}
          />
          <FieldError id="p-in-e" text={errors.inputKg} />
          <p className="hint" id="p-in-h">
            {COPY.inputHint}
          </p>
        </div>
        <div className="field">
          <label htmlFor="p-out">{COPY.outputLabel}</label>
          <input
            id="p-out"
            name="outputKg"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={outputKg}
            disabled={working}
            aria-invalid={errors.outputKg ? true : undefined}
            aria-describedby={describedBy('p-out', !!errors.outputKg, true)}
            onChange={(e) => {
              setOutputKg(e.currentTarget.value);
              recheck({ process, inputKg, outputKg: e.currentTarget.value });
            }}
          />
          <FieldError id="p-out-e" text={errors.outputKg} />
          <p className="hint" id="p-out-h">
            {COPY.outputHint}
          </p>
        </div>
      </div>
      <p className="band-line">
        <Icon name="trend" />
        <span>{bandLine(process || null, crop)}</span>
      </p>
      {actError && !working ? (
        <div className="inline-err" role="alert">
          <Icon name="wifiOff" />
          <p>
            <b>{COPY.recordErrB}</b>
            {COPY.recordErrP}
          </p>
        </div>
      ) : null}
      <p className="dec-note">
        <Icon name="seal" />
        <span>{COPY.signedNote}</span>
      </p>
      <Pill type="submit" disabled={working} icon={<Icon name={working ? 'ring' : actError ? 'retry' : 'check'} className={working ? 'ic spin' : 'ic'} />}>
        {working ? COPY.recording : actError ? COPY.retry : COPY.record}
      </Pill>
      <p className="vh" aria-live="polite">
        {working ? COPY.recording : ''}
      </p>
    </form>
  );
}

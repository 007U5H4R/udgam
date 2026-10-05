'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Icon } from '../../../components/admin/QueueList';
import { Pill } from '../../../components/ui/Pill';
import { VerdictMark } from '../../../components/ui/VerdictChip';
import { COPY } from '../../../lib/processing/copy';
import { FIELD_MESSAGES } from '../../../lib/processing/validate';
import { handOnAction } from './actions';

// "Hand on to a buyer" (contract.html screen 6, variants within · flagged): admin.html's signed-decision
// panel (.decide) with the buyer select, the signed note and one primary pill. Working: "Handing on to
// Buyer B-07…" with the select disabled. Action error: the inline error says nothing was signed and the
// batch is still with you; the pill becomes Try again. Field check: "Choose a buyer from the list." (§28.7).

export function HandOnForm({ batchId, buyers }: { batchId: string; buyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [toOrgId, setToOrgId] = useState('');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [actError, setActError] = useState(false);
  const [working, start] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const buyerName = buyers.find((b) => b.id === toOrgId)?.name ?? '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (working) return;
    setActError(false);
    if (!toOrgId) {
      setFieldErr(FIELD_MESSAGES.buyer);
      selectRef.current?.focus();
      return;
    }
    setFieldErr(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof handOnAction>>;
      try {
        r = await handOnAction({ batchId, toOrgId });
      } catch {
        setActError(true);
        return;
      }
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.reason === 'fields') {
        setFieldErr(r.errors.buyer);
        selectRef.current?.focus();
      } else setActError(true);
    });
  };

  return (
    <form className="decide" aria-labelledby="h-h" noValidate onSubmit={submit} aria-busy={working || undefined}>
      <h3 id="h-h">{COPY.handH}</h3>
      <div className="field">
        <label htmlFor="h-to">{COPY.buyerLabel}</label>
        <select
          ref={selectRef}
          id="h-to"
          name="toOrgId"
          value={toOrgId}
          disabled={working}
          aria-invalid={fieldErr ? true : undefined}
          aria-describedby={fieldErr ? 'h-to-e' : undefined}
          onChange={(e) => {
            setToOrgId(e.currentTarget.value);
            if (e.currentTarget.value) setFieldErr(null);
          }}
        >
          <option value="">{buyers.length ? COPY.chooseBuyer : COPY.noBuyers}</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {fieldErr ? (
          <p className="f-err" id="h-to-e">
            <VerdictMark kind="check" />
            <span>{fieldErr}</span>
          </p>
        ) : null}
      </div>
      {actError && !working ? (
        <div className="inline-err" role="alert">
          <Icon name="wifiOff" />
          <p>
            <b>{COPY.handErrB}</b>
            {COPY.handErrP}
          </p>
        </div>
      ) : null}
      <p className="dec-note">
        <Icon name="seal" />
        <span>{COPY.handNote}</span>
      </p>
      <Pill type="submit" disabled={working} icon={<Icon name={working ? 'ring' : actError ? 'retry' : 'arrowRight'} className={working ? 'ic spin' : 'ic'} />}>
        {working ? COPY.handingOn(buyerName) : actError ? COPY.retry : COPY.handOn}
      </Pill>
      <p className="vh" aria-live="polite">
        {working ? COPY.handingOn(buyerName) : ''}
      </p>
    </form>
  );
}

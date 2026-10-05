'use client';

import { useActionState, useState } from 'react';
import { transferBatchAction, type TransferState } from '../../app/(admin)/admin/batches/actions';
import { Icon } from '../buyer/Icon';
import screen from '../buyer/BatchScreen.module.css';
import { Pill } from '../ui/Pill';
import s from './TransferForm.module.css';

// Custody transfer (TSK-14.5, TC-060; M-002 T4: or a processor, under its own option group): choose and confirm, in admin.html's signed-decision panel
// (".decide"). The note says it plainly: the server signs it on behalf of the admin's account and the
// record is permanent (TP15 honest wording).

export type TransferLabels = {
  title: string;
  buyer: string;
  choose: string;
  /** M-002 T4: what a processor does with the batch (shown under the select). */
  hint: string;
  /** M-002 T4: the option groups ("Buyers", "Processors"). */
  groups: { buyer: string; processor: string };
  note: string;
  submit: string;
  working: string;
  noBuyers: string;
  errors: Record<NonNullable<TransferState['error']>, string>;
};

export function TransferForm({ batchId, buyers, labels }: { batchId: string; buyers: { id: string; name: string; type?: 'buyer' | 'processor' }[]; labels: TransferLabels }) {
  const [state, action, pending] = useActionState<TransferState, FormData>(transferBatchAction, { error: null });
  const [toOrgId, setToOrgId] = useState('');
  return (
    <form action={action} className={screen.decide} aria-labelledby="transfer-h" aria-busy={pending || undefined}>
      <input type="hidden" name="batchId" value={batchId} />
      <h2 id="transfer-h">{labels.title}</h2>
      {buyers.length === 0 ? (
        <p className={screen.note}>{labels.noBuyers}</p>
      ) : (
        <>
          <label htmlFor="transfer-to">{labels.buyer}</label>
          <select
            id="transfer-to"
            name="toOrgId"
            className={s.select}
            value={toOrgId}
            onChange={(e) => setToOrgId(e.currentTarget.value)}
            required
            disabled={pending}
            aria-describedby="transfer-hint transfer-note"
          >
            <option value="">{labels.choose}</option>
            {(['buyer', 'processor'] as const).map((type) => {
              const group = buyers.filter((b) => (b.type ?? 'buyer') === type);
              return group.length ? (
                <optgroup key={type} label={labels.groups[type]}>
                  {group.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <p className={screen.note} id="transfer-hint">
            {labels.hint}
          </p>
        </>
      )}
      <p className={screen.decNote} id="transfer-note">
        <Icon name="seal" />
        <span>{labels.note}</span>
      </p>
      <p className={screen.formError} role="alert">
        {state.error && !pending ? labels.errors[state.error] : ''}
      </p>
      <Pill type="submit" disabled={toOrgId === '' || pending} aria-busy={pending || undefined}>
        {pending ? labels.working : labels.submit}
      </Pill>
    </form>
  );
}

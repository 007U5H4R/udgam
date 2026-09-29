'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '../../../../../../components/ui/Pill';
import { TextField } from '../../../../../../components/ui/TextField';
import s from '../../plots.module.css';
import { outcomeOf, REASON_TEXT } from './copy';

// "Attach a certificate" (TKT-13): the issuer's name, the validity dates and the PDF. It posts to this
// plot's attestation route (a route handler, so the 10 MB file is not held to the Server Action cap) and
// re-renders the page on success. A ghost pill: the plot page's one primary stays the boundary save.

export function AttestationForm({ plotId }: { plotId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return setError(REASON_TEXT.no_file);
    setError('');
    start(async () => {
      let res: Response;
      try {
        res = await fetch(`/admin/plots/${plotId}/attestation`, { method: 'POST', body: form });
      } catch {
        setError('Could not reach the server. Check the connection and try again.');
        return;
      }
      // The status decides before the body: a 401, a proxy's 413 or a 5xx page is not the route's JSON.
      const body: unknown = await res.json().catch(() => null);
      const result = outcomeOf(res.status, body);
      if (!result.ok) return setError(result.message);
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={ref} className={s.form} onSubmit={onSubmit} aria-label="Attach an organic certificate" noValidate>
      <TextField label="Issued by" id="att-issuer" name="issuer" autoComplete="off" maxLength={120} required />
      <div>
        <label className={s.label} htmlFor="att-from">
          Valid from
        </label>
        <input id="att-from" name="validFrom" type="date" className={s.control} required />
      </div>
      <div>
        <label className={s.label} htmlFor="att-to">
          Valid until
        </label>
        <input id="att-to" name="validTo" type="date" className={s.control} required />
      </div>
      <div>
        <label className={s.label} htmlFor="att-file">
          Certificate <span>(PDF, up to 10 MB)</span>
        </label>
        <input id="att-file" name="file" type="file" accept=".pdf,application/pdf" className={s.control} required />
      </div>
      <p className={s.error} role="alert" id="att-error">
        {error}
      </p>
      <div className={s.actions}>
        <Pill type="submit" variant="ghost" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Attach certificate'}
        </Pill>
      </div>
    </form>
  );
}

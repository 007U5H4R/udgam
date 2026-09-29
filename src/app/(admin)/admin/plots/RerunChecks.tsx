'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pill } from '../../../../components/ui/Pill';
import { rerunRegistrationChecksAction } from './actions';
import { REASON_TEXT } from './copy';
import s from './plots.module.css';

// "Check again" for a plot's registration checks (TKT-07): runs forest loss and the NDVI history again
// for the current boundary (a provider that failed is asked again; answers already on record come from
// the cache), then the page re-renders with the new result.

export function RerunChecks({ plotId }: { plotId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={s.rerun}>
      <Pill
        variant="ghost"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await rerunRegistrationChecksAction(plotId);
            if (!r.ok) {
              setError(REASON_TEXT[r.reason]);
              return;
            }
            setError(null);
            router.refresh();
          })
        }
      >
        {pending ? 'Checking…' : 'Check again'}
      </Pill>
      <p className={s.error} role="alert">
        {error ?? ''}
      </p>
    </div>
  );
}

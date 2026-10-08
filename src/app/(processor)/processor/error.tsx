'use client';

import { useRetry } from '../../../components/field/route-error';
import { RailShell } from '../../../components/ui/Rail';
import { COPY } from '../../../lib/processing/copy';
import { ErrorCard } from './ErrorCard';
import '../../../styles/admin.css';
import './processor.css';

// Error state of the processor screens (Design.md §28.6): what happened, that nothing was changed, and
// "Try again", which fetches the route afresh and re-renders it where the processor was (useRetry, as
// every other surface's boundary does: CR-100 follow-up). No error detail is shown.
export default function ProcessorError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const retry = useRetry(reset);
  return (
    <RailShell className="proc-shell" current="batches" items={[{ id: 'batches', href: '/processor' }]} label={COPY.railLabel}>
      <main className="review proc" data-state="error" id="main">
        <section className="queue" aria-labelledby="q-h">
          <header className="q-head">
            <h1 id="q-h">{COPY.title}</h1>
          </header>
          <ErrorCard onRetry={retry} />
        </section>
      </main>
    </RailShell>
  );
}

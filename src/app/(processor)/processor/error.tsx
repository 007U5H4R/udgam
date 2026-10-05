'use client';

import { RailShell } from '../../../components/ui/Rail';
import { COPY } from '../../../lib/processing/copy';
import { ErrorCard } from './ErrorCard';
import '../../../styles/admin.css';
import './processor.css';

// Error state of the processor screens (Design.md §28.6): what happened, that nothing was changed, and
// "Try again" (reloads the list). No error detail is shown.
export default function ProcessorError() {
  return (
    <RailShell className="proc-shell" current="batches" items={[{ id: 'batches', href: '/processor' }]} label={COPY.railLabel}>
      <main className="review proc" data-state="error" id="main">
        <section className="queue" aria-labelledby="q-h">
          <header className="q-head">
            <h1 id="q-h">{COPY.title}</h1>
          </header>
          <ErrorCard />
        </section>
      </main>
    </RailShell>
  );
}

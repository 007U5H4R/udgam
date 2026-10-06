'use client';

import { usePathname } from 'next/navigation';
import { StateCard } from '../../../components/buyer/BatchStates';
import screen from '../../../components/buyer/BatchScreen.module.css';
import { useRetry } from '../../../components/field/route-error';
import { Pill } from '../../../components/ui/Pill';
import { RailShell, type RailSection } from '../../../components/ui/Rail';

// The /admin route group's error boundary (CR-100; Design.md §18, EVAL-088): Plots, Phones, Agreements
// and Demo tools, and anything else under /admin without a nearer one (Review and Batches have their
// own). Inside the admin shell, with the section the admin was on marked in the rail: what happened,
// that nothing was changed, and Try again, which fetches the route afresh. No error detail is shown.
// English only, like the rest of the admin surface (N5). Composed from ported parts (TP17): the batch
// screens' error card and the amber pill.

const SECTIONS: { prefix: string; title: string; rail: RailSection }[] = [
  { prefix: '/admin/plots', title: 'Plots', rail: 'plots' },
  { prefix: '/admin/phones', title: 'Phones', rail: 'phones' },
  { prefix: '/admin/agreements', title: 'Agreements', rail: 'batches' },
  { prefix: '/admin/batches', title: 'Batches', rail: 'batches' },
  { prefix: '/admin/demo', title: 'Demo tools', rail: 'review' },
];
const REVIEW = { title: 'Review', rail: 'review' as const };

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const retry = useRetry(reset);
  const path = usePathname();
  const section = SECTIONS.find((x) => path === x.prefix || path.startsWith(`${x.prefix}/`)) ?? REVIEW;
  return (
    <RailShell current={section.rail}>
      <main className={`${screen.main} ${screen.single}`} data-state="error" id="main">
        <section className={screen.queue} aria-labelledby="admin-error-h">
          <h1 className={screen.h1} id="admin-error-h">
            {section.title}
          </h1>
          <StateCard
            kind="error"
            title="Couldn’t load this page."
            body="Nothing was changed. Try again in a moment."
            action={
              <Pill variant="amber" className={screen.statePill} onClick={retry}>
                Try again
              </Pill>
            }
          />
        </section>
      </main>
    </RailShell>
  );
}

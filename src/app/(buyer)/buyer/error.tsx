'use client';

import { StateCard } from '../../../components/buyer/BatchStates';
import { useRetry } from '../../../components/field/route-error';
import screen from '../../../components/buyer/BatchScreen.module.css';
import { Pill } from '../../../components/ui/Pill';
import { t } from '../../../lib/i18n';

// Error state of the buyer screens (technical-plan §11): what happened, that nothing was changed, and
// what to do. No error detail is shown. Try again fetches the route afresh, then re-renders it (useRetry,
// as every other surface's boundary does: CR-100 follow-up).
export default function BuyerError({ reset }: { error: Error; reset: () => void }) {
  const retry = useRetry(reset);
  return (
    <main className={`${screen.main} ${screen.single}`}>
      <section className={screen.queue} aria-labelledby="buyer-error-h">
        <h1 className={screen.h1} id="buyer-error-h">
          {t('batches.title')}
        </h1>
        <StateCard
          kind="error"
          title={t('batches.error.title')}
          body={t('batches.error.body')}
          action={
            <Pill variant="amber" className={screen.statePill} onClick={retry}>
              {t('batches.error.retry')}
            </Pill>
          }
        />
      </section>
    </main>
  );
}

import { ListLoading } from '../../../../../components/buyer/BatchStates';
import screen from '../../../../../components/buyer/BatchScreen.module.css';
import { t } from '../../../../../lib/i18n';

// Loading state of /admin/batches (technical-plan §11): a skeleton list, never a spinner alone. It sits
// in the (list) group so it does not wrap /admin/batches/[batchId]: a Suspense boundary there would
// stream a 200 before notFound() could answer 404 for another org's batch (EVAL-080).
export default function BatchesLoading() {
  return (
    <main className={`${screen.main} ${screen.single}`}>
      <section className={screen.queue} aria-labelledby="batches-loading-h">
        <h1 className={screen.h1} id="batches-loading-h">
          {t('batches.title')}
        </h1>
        <ListLoading label={t('batches.loading')} />
      </section>
    </main>
  );
}

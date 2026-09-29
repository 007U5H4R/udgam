import { ListLoading } from '../../../../components/buyer/BatchStates';
import screen from '../../../../components/buyer/BatchScreen.module.css';
import { t } from '../../../../lib/i18n';

// Loading state of /buyer (technical-plan §11): a skeleton list. It sits in the (list) group so it does
// not wrap /buyer/batches/[batchId]: a Suspense boundary there would stream a 200 before notFound()
// could answer 404 for a batch the buyer does not hold (EVAL-080).
export default function BuyerLoading() {
  return (
    <main className={`${screen.main} ${screen.single}`}>
      <section className={screen.queue} aria-labelledby="buyer-loading-h">
        <h1 className={screen.h1} id="buyer-loading-h">
          {t('batches.title')}
        </h1>
        <ListLoading label={t('batches.loading')} />
      </section>
    </main>
  );
}

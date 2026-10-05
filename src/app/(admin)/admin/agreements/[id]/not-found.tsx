import Link from 'next/link';
import { Icon } from '../../../../../components/admin/QueueList';
import { EmptyCard } from '../../../../../components/agreements/parts';
import { RailShell } from '../../../../../components/ui/Rail';
import { t } from '../../../../../lib/i18n';
import '../../../../../styles/admin.css';
import '../../../../../components/agreements/agreements.css';

// The empty (not found) state of a FPO agreement (Design.md §28.6): an unknown id and another
// organisation's id read the same, with a 404 (EVAL-080, CF-10).
export default function AgreementNotFound() {
  return (
    <RailShell current="batches">
    <main className="review agr" data-state="empty" id="main">
      <section className="queue" aria-labelledby="q-h">
        <header className="q-head">
          <Link className="back" href="/admin/agreements">
            <Icon name="arrowLeft" />
            {t('agreements.back')}
          </Link>
          <h1 id="q-h">{t('agreements.fpo.title')}</h1>
        </header>
        <EmptyCard title={t('agreements.notFound.title')} body={t('agreements.notFound.body')} />
      </section>
    </main>
    </RailShell>
  );
}

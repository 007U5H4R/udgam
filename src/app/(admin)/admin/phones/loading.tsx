import { RailShell } from '../../../../components/ui/Rail';
import { t } from '../../../../lib/i18n';
import { PhonesSkeleton } from './states';
import s from './phones.module.css';

// Streaming fallback while the Phones page loads (a skeleton, not a spinner; Design.md §18).
export default function Loading() {
  return (
    <RailShell current="phones">
      <main className={s.page}>
        <header>
          <h1 className={s.h1}>{t('phones.title')}</h1>
          <p className={s.sub}>{t('phones.sub')}</p>
        </header>
        <PhonesSkeleton />
      </main>
    </RailShell>
  );
}

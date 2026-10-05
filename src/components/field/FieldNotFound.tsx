import Image from 'next/image';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { NotFoundCard } from '../ui/NotFound';
import { TabBar, type Tab } from '../ui/TabBar';

// The capture app's not-found (DES-011): the field screen with its wordmark and tab bar around the shared
// not-found card, in the agent's language, with a way back (Design.md §18/§20: what happened, what to do
// next, and that the saved pickings are safe).
export function FieldNotFound({
  lang,
  tab,
  title,
  body,
  backHref,
  backLabel,
}: {
  lang: Lang;
  tab: Tab;
  title: MessageKey;
  body: MessageKey;
  backHref: string;
  backLabel: MessageKey;
}) {
  return (
    <main className="screen has-tabs">
      <header className="top">
        <span className="wordmark">
          <Image src="/brand/cherry.svg" alt="" width={40} height={40} unoptimized />
          {t('app.name', {}, lang)}
        </span>
      </header>
      <NotFoundCard title={t(title, {}, lang)} body={t(body, {}, lang)} backHref={backHref} backLabel={t(backLabel, {}, lang)} />
      <TabBar current={tab} lang={lang} />
    </main>
  );
}

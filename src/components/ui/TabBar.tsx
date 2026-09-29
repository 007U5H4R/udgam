import Link from 'next/link';
import { t, type Lang } from '../../lib/i18n';
import { Ic } from '../field/icons';

// The floating glass tab bar (Design.md §5, §13), ported from final/index.html `.tabbar`: Home ·
// Pickings · Help, icon + word. Home and Pickings navigate; Help opens the Help sheet in place when the
// screen hands in `onHelp` (TKT-11), and otherwise goes to /field/help (Home with the sheet open). The
// current tab carries aria-current="page" (the Help button too, while its sheet is open). Never
// rendered in the record flow. It sits above env(safe-area-inset-bottom) (field.css `.tabbar`).

export type Tab = 'home' | 'pickings' | 'help';

export function TabBar({ current, lang = 'en', onHelp }: { current: Tab; lang?: Lang; onHelp?: () => void }) {
  const here = (tab: Tab) => (tab === current ? ('page' as const) : undefined);
  return (
    <nav className="tabbar" aria-label={t('tabs.label', {}, lang)}>
      <Link className="tab" href="/field" aria-current={here('home')}>
        <Ic name="home" />
        {t('tabs.home', {}, lang)}
      </Link>
      <Link className="tab" href="/field/pickings" aria-current={here('pickings')}>
        <Ic name="list" />
        {t('tabs.pickings', {}, lang)}
      </Link>
      {onHelp ? (
        <button className="tab" type="button" aria-haspopup="dialog" aria-current={here('help')} onClick={onHelp}>
          <Ic name="help" />
          {t('tabs.help', {}, lang)}
        </button>
      ) : (
        <Link className="tab" href="/field/help" aria-current={here('help')}>
          <Ic name="help" />
          {t('tabs.help', {}, lang)}
        </Link>
      )}
    </nav>
  );
}

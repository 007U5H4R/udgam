import Image from 'next/image';
import Link from 'next/link';
import { t, type Lang } from '../../lib/i18n';
import pill from '../ui/Pill.module.css';
import { GlassCard } from '../ui/GlassCard';
import { TabBar, type Tab } from '../ui/TabBar';
import { Ic } from './icons';

// Home's loading and error states (Design.md §18; no mockup, composed per TP17): a skeleton of the plot
// line and the list (no spinner), and "Couldn't load your entries. Your saved pickings are safe on this
// phone." with Try again.

function Header({ lang }: { lang: Lang }) {
  return (
    <header className="top">
      <span className="wordmark">
        <Image src="/brand/cherry.svg" alt="" width={40} height={40} unoptimized />
        {t('app.name', {}, lang)}
      </span>
    </header>
  );
}

export function HomeSkeleton({ lang }: { lang: Lang }) {
  return (
    <main className="screen has-tabs" aria-busy="true" aria-labelledby="s1-h">
      <Header lang={lang} />
      <h1 className="vh" id="s1-h">
        {t('home.loading', {}, lang)}
      </h1>
      <GlassCard as="article" className="plot-card" aria-hidden="true">
        <div className="skel skel-map" />
        <div className="skel skel-line" />
        <div className="skel skel-line short" />
      </GlassCard>
      <div className="skel skel-pill record" aria-hidden="true" />
      <ul className="rows" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <GlassCard as="li" card={false} className="row" key={i}>
            <div className="skel skel-line short" />
          </GlassCard>
        ))}
      </ul>
      <TabBar current="home" lang={lang} />
    </main>
  );
}

/**
 * The error state. In a route's error boundary (error.tsx) `onRetry` re-renders the failed route and
 * `tab` marks the tab the agent was on; rendered by a page, Try again simply reloads /field.
 */
export function HomeError({ lang, tab = 'home', onRetry }: { lang: Lang; tab?: Tab; onRetry?: () => void }) {
  return (
    <main className="screen has-tabs" aria-labelledby="s1-h">
      <Header lang={lang} />
      {/* DES-020: role="alert" is not allowed on an <article>: the card is a <div>. */}
      <GlassCard className="plot-card" role="alert">
        <h1 className="h1 plot-h" id="s1-h" tabIndex={-1}>
          {t('home.error.title', {}, lang)}
        </h1>
        <p className="facts">{t('home.error.body', {}, lang)}</p>
      </GlassCard>
      <Link
        className={[pill.pill, pill.amber, 'record'].join(' ')}
        href="/field"
        onClick={
          onRetry
            ? (e) => {
                e.preventDefault();
                onRetry();
              }
            : undefined
        }
      >
        <Ic name="retry" />
        {t('home.error.retry', {}, lang)}
      </Link>
      <TabBar current={tab} lang={lang} />
    </main>
  );
}

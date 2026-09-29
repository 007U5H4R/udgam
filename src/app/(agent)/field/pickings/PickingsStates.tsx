import Link from 'next/link';
import type { ReactNode } from 'react';
import { Ic } from '../../../../components/field/icons';
import { GlassCard } from '../../../../components/ui/GlassCard';
import pill from '../../../../components/ui/Pill.module.css';
import { TabBar } from '../../../../components/ui/TabBar';
import { t, type Lang } from '../../../../lib/i18n';

// The Pickings tab's loading, empty and error states (Design.md §18; composed from the ported parts,
// TP17): skeleton rows (no spinner); "No pickings recorded yet" with the record action; and "Couldn't
// load your entries. Your saved pickings are safe on this phone." with Try again.

export function PickingsFrame({ lang, busy, chip, children }: { lang: Lang; busy?: boolean; chip?: ReactNode; children: ReactNode }) {
  return (
    <main className="screen has-tabs" aria-labelledby="s8-h" aria-busy={busy ? 'true' : undefined}>
      <header className="top">
        <h1 className="h1" id="s8-h" tabIndex={-1}>
          {t('pk.title', {}, lang)}
        </h1>
        {chip}
      </header>
      {children}
      <TabBar current="pickings" lang={lang} />
    </main>
  );
}

export function PickingsSkeleton({ lang }: { lang: Lang }) {
  return (
    <PickingsFrame lang={lang} busy>
      <p className="vh">{t('pk.loading', {}, lang)}</p>
      <div className="month" aria-hidden="true">
        <div className="skel skel-line short" />
      </div>
      <ul className="rows" aria-hidden="true" data-testid="pickings-skeleton">
        {[0, 1, 2, 3].map((i) => (
          <GlassCard as="li" card={false} className="row" key={i}>
            <div className="skel skel-line short" />
          </GlassCard>
        ))}
      </ul>
    </PickingsFrame>
  );
}

export function PickingsEmpty({ lang }: { lang: Lang }) {
  return (
    <>
      <GlassCard as="article" className="plot-card" data-testid="pickings-empty">
        <p className="h1 plot-h">{t('home.empty', {}, lang)}</p>
        <p className="facts">{t('pk.emptyBody', {}, lang)}</p>
      </GlassCard>
      <Link className={[pill.pill, 'record'].join(' ')} href="/field">
        <Ic name="camera" />
        {t('home.record', {}, lang)}
      </Link>
    </>
  );
}

export function PickingsError({ lang }: { lang: Lang }) {
  return (
    <PickingsFrame lang={lang}>
      <GlassCard as="article" className="plot-card" role="alert">
        <p className="h1 plot-h">{t('home.error.title', {}, lang)}</p>
        <p className="facts">{t('home.error.body', {}, lang)}</p>
      </GlassCard>
      <Link className={[pill.pill, pill.amber, 'record'].join(' ')} href="/field/pickings">
        <Ic name="retry" />
        {t('home.error.retry', {}, lang)}
      </Link>
    </PickingsFrame>
  );
}

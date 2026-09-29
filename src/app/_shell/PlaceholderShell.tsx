import Image from 'next/image';
import { GlassCard } from '../../components/ui/GlassCard';
import { Pill } from '../../components/ui/Pill';
import { t, type MessageKey } from '../../lib/i18n';
import { signOut } from '../(public)/sign-in/actions';
import s from './shell.module.css';

// TEMPORARY (TKT-04): the signed-in landing shell for /field, /admin and /buyer until their screens
// land (TKT-10 Home, TKT-12 review queue with the ported rail, TKT-14 buyer list). Composed from
// ported parts only (TP17): wordmark, heading, one frosted card with the empty state, and sign-out.

export function PlaceholderShell({ title, empty }: { title: MessageKey; empty: MessageKey }) {
  return (
    <main className={s.screen}>
      <header className={s.top}>
        <span className={s.wordmark}>
          <Image src="/brand/cherry.svg" alt="" width={40} height={40} unoptimized priority />
          {t('app.name')}
        </span>
      </header>
      <h1 className={s.h1}>{t(title)}</h1>
      <GlassCard as="section" className={s.empty}>
        <p>{t(empty)}</p>
      </GlassCard>
      <form action={signOut} className={s.actions}>
        <Pill variant="ghost" type="submit">
          {t('signOut')}
        </Pill>
      </form>
    </main>
  );
}

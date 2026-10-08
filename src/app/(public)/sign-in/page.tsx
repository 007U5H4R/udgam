import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { HOME } from '../../../lib/auth/session';
import { throwIfForced } from '../../../lib/config/test-surfaces';
import { isLang, LANG_COOKIE, t, type Lang } from '../../../lib/i18n';
import { currentUser } from '../../_auth/require';
import { SignInForm } from './SignInForm';
import s from './sign-in.module.css';

// /sign-in (technical-plan §3.2, TC-020). No mockup: composed from ported components only (TP17) —
// ground glow, the small cherry, one frosted card with email + password, one primary pill. Stage 8:
// DES-015, it speaks the phone's chosen language (the `udgam_lang` cookie, which also sets <html lang> in
// the root layout), so a Kannada-first agent signs in in Kannada; DES-220, one line points a certificate
// visitor who lands here to the link or QR code they were given.
export const dynamic = 'force-dynamic';

async function pageLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'en';
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return { title: `${t('signIn.submit', {}, lang)} · ${t('app.name', {}, lang)}` };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  throwIfForced((await searchParams).state); // dev and e2e only: shows /sign-in's error boundary (CR-100)
  const user = await currentUser();
  if (user) redirect(HOME[user.role]);
  const lang = await pageLang();
  const [before, after] = t('signIn.title', {}, lang).split('{app}');
  return (
    <main className={s.screen}>
      <div className={s.cherry}>
        <Image src="/brand/cherry.svg" alt="" width={104} height={104} unoptimized priority />
      </div>
      <h1 className={s.h1}>
        {before}
        <span className={s.lit}>{t('app.name', {}, lang)}</span>
        {after}
      </h1>
      <p className={s.lede}>{t('signIn.lede', {}, lang)}</p>
      <SignInForm
        labels={{
          email: t('signIn.email', {}, lang),
          password: t('signIn.password', {}, lang),
          submit: t('signIn.submit', {}, lang),
          working: t('signIn.working', {}, lang),
          error: t('signIn.error', {}, lang),
          errorHelp: t('signIn.errorHelp', {}, lang),
          unavailable: t('signIn.unavailable', {}, lang),
        }}
      />
      <p className={s.hint} data-testid="certificate-hint">
        {t('signIn.certificateHint', {}, lang)}
      </p>
    </main>
  );
}

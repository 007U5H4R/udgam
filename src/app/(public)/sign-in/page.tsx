import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { HOME } from '../../../lib/auth/session';
import { t } from '../../../lib/i18n';
import { currentUser } from '../../_auth/require';
import { SignInForm } from './SignInForm';
import s from './sign-in.module.css';

// /sign-in (technical-plan §3.2, TC-020). No mockup: composed from ported components only (TP17) —
// ground glow, the small cherry, one frosted card with email + password, one primary pill.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in · Udgam' };

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect(HOME[user.role]);
  const [before, after] = t('signIn.title').split('{app}');
  return (
    <main className={s.screen}>
      <div className={s.cherry}>
        <Image src="/brand/cherry.svg" alt="" width={104} height={104} unoptimized priority />
      </div>
      <h1 className={s.h1}>
        {before}
        <span className={s.lit}>{t('app.name')}</span>
        {after}
      </h1>
      <p className={s.lede}>{t('signIn.lede')}</p>
      <SignInForm
        labels={{
          email: t('signIn.email'),
          password: t('signIn.password'),
          submit: t('signIn.submit'),
          working: t('signIn.working'),
          error: t('signIn.error'),
          unavailable: t('signIn.unavailable'),
        }}
      />
    </main>
  );
}

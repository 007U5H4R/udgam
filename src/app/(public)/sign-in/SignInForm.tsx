'use client';

import { useActionState, useEffect } from 'react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Pill } from '../../../components/ui/Pill';
import { TextField } from '../../../components/ui/TextField';
import { signIn, type SignInState } from './actions';
import s from './sign-in.module.css';

export type SignInLabels = { email: string; password: string; submit: string; working: string; error: string; unavailable: string };

/** One frosted card with the two fields, the inline error under them, and the one primary pill. */
export function SignInForm({ labels }: { labels: SignInLabels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  // Signed in: load the role's home as a new document, so it gets its own Content-Security-Policy (the
  // admin's allows the map tiles; a client navigation would keep the sign-in page's). TASK-20 fix round 2.
  const home = state.home;
  useEffect(() => {
    if (home) window.location.assign(home);
  }, [home]);
  const busy = pending || home !== undefined; // the button stays "working" until the new page loads
  // Only a credential refusal marks the fields invalid; "unavailable" is not about what was typed.
  const invalid = state.error === 'credentials' && !pending;
  const message = pending || state.error === null ? '' : state.error === 'credentials' ? labels.error : labels.unavailable;
  return (
    <form action={action} className={s.form} noValidate>
      <GlassCard className={s.card}>
        <TextField
          id="email"
          name="email"
          type="email"
          label={labels.email}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'sign-in-error' : undefined}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label={labels.password}
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'sign-in-error' : undefined}
        />
      </GlassCard>
      <p id="sign-in-error" className={s.error} role="alert">
        {message}
      </p>
      <Pill type="submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? labels.working : labels.submit}
      </Pill>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Pill } from '../../../components/ui/Pill';
import { TextField } from '../../../components/ui/TextField';
import { signIn, type SignInState } from './actions';
import s from './sign-in.module.css';

export type SignInLabels = { email: string; password: string; submit: string; working: string; error: string; errorHelp: string; unavailable: string };

/** One frosted card with the two fields, the inline error under them, and the one primary pill. */
export function SignInForm({ labels }: { labels: SignInLabels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  // DES-209 (preserve work): the email stays as typed after a refused attempt (a controlled field keeps
  // its value through React's form reset), and focus returns to it rather than dropping to <body>.
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (state.error !== null) document.getElementById('email')?.focus();
  }, [state]);
  // Signed in: load the role's home as a new document, so it gets its own Content-Security-Policy (the
  // admin's allows the map tiles; a client navigation would keep the sign-in page's). TASK-20 fix round 2.
  const home = state.home;
  useEffect(() => {
    if (home) window.location.assign(home);
  }, [home]);
  const busy = pending || home !== undefined; // the button stays "working" until the new page loads
  // Only a credential refusal marks the fields invalid; "unavailable" is not about what was typed.
  const invalid = state.error === 'credentials' && !pending;
  // DES-025 (2): a refusal says what happened and what to do next (ask the office for a forgotten password).
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'sign-in-error sign-in-help' : undefined}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label={labels.password}
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'sign-in-error sign-in-help' : undefined}
        />
      </GlassCard>
      <div role="alert">
        <p id="sign-in-error" className={s.error}>
          {message}
        </p>
        {invalid ? (
          <p id="sign-in-help" className={s.help}>
            {labels.errorHelp}
          </p>
        ) : null}
      </div>
      <Pill type="submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? labels.working : labels.submit}
      </Pill>
    </form>
  );
}

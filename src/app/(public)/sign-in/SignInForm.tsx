'use client';

import { useActionState } from 'react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Pill } from '../../../components/ui/Pill';
import { TextField } from '../../../components/ui/TextField';
import { signIn, type SignInState } from './actions';
import s from './sign-in.module.css';

export type SignInLabels = { email: string; password: string; submit: string; working: string; error: string; unavailable: string };

/** One frosted card with the two fields, the inline error under them, and the one primary pill. */
export function SignInForm({ labels }: { labels: SignInLabels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
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
      <Pill type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? labels.working : labels.submit}
      </Pill>
    </form>
  );
}

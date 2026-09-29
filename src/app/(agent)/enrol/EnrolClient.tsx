'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { getPref, setPref } from '../../../client/db';
import { exportPublicJwk, saveEnrolment } from '../../../client/device-key';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Pill } from '../../../components/ui/Pill';
import { TextField } from '../../../components/ui/TextField';
import { generateDeviceKey } from '../../../lib/crypto';
import { normaliseCode } from '../../../lib/enrolment/code-format';
import { isLang, LANG_COOKIE, t, type Lang, type MessageKey } from '../../../lib/i18n';
import { LanguageSheet } from './LanguageSheet';
import s from './enrol.module.css';

// /enrol (TC-022, TC-025): first-run language sheet → "Enter the 6-letter code from the office" →
// "This phone is ready" → /field. The key pair is generated in the browser with a NON-extractable
// private key; only the public JWK is posted, and the pair is stored (IndexedDB) only once the server
// has accepted it.

type ErrorKey = 'invalid' | 'expired' | 'used' | 'rate_limited' | 'network' | 'other' | 'unsupported' | 'saveFailed';
const ERRORS: Record<ErrorKey, MessageKey> = {
  invalid: 'enrol.error.invalid',
  expired: 'enrol.error.expired',
  used: 'enrol.error.used',
  rate_limited: 'enrol.error.rate_limited',
  network: 'enrol.error.network',
  other: 'enrol.error.other',
  unsupported: 'enrol.error.unsupported',
  saveFailed: 'enrol.error.saveFailed',
};
const SERVER_REASONS = new Set<string>(['invalid', 'expired', 'used', 'rate_limited']);
const YEAR_S = 365 * 24 * 3600;

/** The heading with the screen's one gradient word (`{word}` in the message). */
function Heading({ text, word, ref, testId }: { text: string; word: string; ref?: Ref<HTMLHeadingElement>; testId?: string }) {
  const [before, after] = text.split('{word}');
  return (
    <h1 ref={ref} className={s.h1} tabIndex={-1} data-testid={testId}>
      {before}
      <span className={s.lit}>{word}</span>
      {after}
    </h1>
  );
}

export function EnrolClient({ initialLang }: { initialLang: Lang | null }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang | null>(initialLang);
  const [phase, setPhase] = useState<'code' | 'working' | 'done'>('code');
  const [error, setError] = useState<ErrorKey | null>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const L: Lang = lang ?? 'en';
  const tr = (key: MessageKey, vars: Record<string, string> = {}) => t(key, vars, L);

  useEffect(() => {
    document.documentElement.lang = L;
  }, [L]);

  // The cookie is the truth for the server render; IndexedDB `prefs` keeps the choice on the phone too,
  // so a cleared cookie is restored without asking again.
  useEffect(() => {
    if (initialLang) return;
    let live = true;
    getPref('lang')
      .then((v) => {
        if (live && isLang(v)) choose(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  useEffect(() => {
    if (phase === 'done') doneHeading.current?.focus();
  }, [phase]);

  function choose(next: Lang) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${YEAR_S}; samesite=lax`;
    setLang(next);
    setPref('lang', next).catch(() => undefined); // the cookie alone is enough
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = normaliseCode(String(new FormData(e.currentTarget).get('code') ?? ''));
    if (!code) {
      setError('invalid');
      return;
    }
    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
      setError('unsupported');
      return;
    }
    setPhase('working');
    setError(null);
    try {
      const pair = await generateDeviceKey(); // private key: extractable false
      const publicJwk = await exportPublicJwk(pair);
      let res: Response;
      try {
        res = await fetch('/api/enrol', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, publicJwk }) });
      } catch {
        setError('network');
        setPhase('code');
        return;
      }
      if (res.status === 401) {
        router.push('/sign-in');
        return;
      }
      if (!res.ok) {
        const reason = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
        setError(typeof reason === 'string' && SERVER_REASONS.has(reason) ? (reason as ErrorKey) : 'other');
        setPhase('code');
        return;
      }
      const { deviceId } = (await res.json()) as { deviceId: string };
      // The server's chain head is seq 0 with no previous event: the first picking signs seq 1 on 'genesis'.
      try {
        await saveEnrolment(pair, { deviceId, nextSeq: 1, lastEventHash: 'genesis' });
      } catch (err) {
        // The server enrolled the key and spent the code, but this phone could not keep it: a new code is
        // the only way forward. Logged without key material (the error class only).
        console.error('enrol.save_failed', { deviceId, errClass: err instanceof Error ? err.name : typeof err });
        setError('saveFailed');
        setPhase('code');
        return;
      }
      setPhase('done');
    } catch {
      setError('other');
      setPhase('code');
    }
  }

  const working = phase === 'working';
  return (
    <main className={s.screen} lang={L}>
      <div className={s.cherry}>
        <Image src="/brand/cherry.svg" alt="" width={104} height={104} unoptimized priority />
      </div>
      {phase === 'done' ? (
        <>
          <Heading ref={doneHeading} text={tr('enrol.done.title')} word={tr('enrol.done.titleWord')} testId="enrol-done" />
          <p className={s.lede}>{tr('enrol.done.lede')}</p>
          <div className={s.done}>
            <Pill onClick={() => router.push('/field')}>{tr('enrol.done.next')}</Pill>
          </div>
        </>
      ) : (
        <>
          <Heading text={tr('enrol.title')} word={tr('enrol.titleWord')} />
          <p className={s.lede}>{tr('enrol.lede')}</p>
          <form className={s.form} onSubmit={submit} noValidate>
            <GlassCard className={s.card}>
              <TextField
                id="code"
                name="code"
                className={s.code}
                label={tr('enrol.code')}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={9}
                required
                aria-invalid={error !== null || undefined}
                aria-describedby="enrol-error"
                disabled={working}
              />
            </GlassCard>
            <p id="enrol-error" className={s.error} role="alert">
              {error ? tr(ERRORS[error]) : ''}
            </p>
            <Pill type="submit" disabled={working} aria-busy={working || undefined}>
              {working ? tr('enrol.working') : tr('enrol.submit')}
            </Pill>
          </form>
        </>
      )}
      <LanguageSheet open={lang === null} current={lang} onChoose={choose} />
    </main>
  );
}

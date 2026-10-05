import { cookies } from 'next/headers';
import { env } from '../../../lib/config/env';
import { isLang, LANG_COOKIE, type Lang } from '../../../lib/i18n';

// Shared by the /field pages: the agent's language, and the test-only forced states (§1 test-only
// surfaces: honoured outside production, or with E2E=1, never in a production deployment).

/** The agent's language from the `udgam_lang` cookie (TSK-11.7), English when unset or unknown. */
export async function langFromCookies(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'en';
}

const testSurfaces = () => env.NODE_ENV !== 'production' || env.E2E === '1';

export type Forced = 'loading' | 'empty' | 'error' | null;

/** `?state=loading|empty|error`: that state, rendered by the page itself (§11). */
export function forcedState(v: unknown): Forced {
  if (!testSurfaces()) return null;
  return v === 'loading' || v === 'empty' || v === 'error' ? v : null;
}

/** `?state=throw`: the page throws, so its route's error boundary (error.tsx) shows (EVAL-088). */
export function throwIfForced(v: unknown): void {
  if (testSurfaces() && v === 'throw') throw new Error('forced_route_error');
}

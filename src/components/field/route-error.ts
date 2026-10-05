'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useSyncExternalStore } from 'react';
import { isLang, type Lang } from '../../lib/i18n';

// What the /field error boundaries (error.tsx, client components) need: the page's language and a
// Try again that really retries. The language is the one the root layout put on <html lang> from the
// `udgam_lang` cookie (TSK-11.7); before hydration it is English, the shipped default (N5).

const unchanging = () => () => undefined;
const docLang = (): Lang => {
  const l = document.documentElement.lang;
  return isLang(l) ? l : 'en';
};

/** The page's language (<html lang>), for client components that cannot read the cookie. */
export function useDocLang(): Lang {
  return useSyncExternalStore(unchanging, docLang, () => 'en');
}

/** Try again in an error boundary: fetch the route's server part afresh, then re-render the boundary's children. */
export function useRetry(reset: () => void): () => void {
  const router = useRouter();
  return () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
}

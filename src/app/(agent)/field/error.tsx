'use client';

import { usePathname } from 'next/navigation';
import { HomeError } from '../../../components/field/HomeStates';
import { useDocLang, useRetry } from '../../../components/field/route-error';

// Every /field route's error boundary (Design.md §18, EVAL-088, TC-051): /field/record, /field/help and
// /field/pickings/[eventId] (Home and the Pickings list have their own, nearer ones). It says what
// happened, that the saved pickings are safe on this phone, and offers Try again, which renders the
// route afresh. An error boundary does not start the stream, so the detail page's 404 still holds
// (no loading.tsx may sit on that path: tests/field-error-boundaries.test.ts).
export default function FieldError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useDocLang();
  const retry = useRetry(reset);
  const path = usePathname();
  const tab = path.startsWith('/field/pickings') ? 'pickings' : path.startsWith('/field/help') ? 'help' : 'home';
  return <HomeError lang={lang} tab={tab} onRetry={retry} />;
}

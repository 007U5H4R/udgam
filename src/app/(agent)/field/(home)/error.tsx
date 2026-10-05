'use client';

import { HomeError } from '../../../../components/field/HomeStates';
import { useDocLang, useRetry } from '../../../../components/field/route-error';

// /field when rendering failed (Design.md §18): what happened, that saved pickings are safe, and Try
// again, in the agent's language (<html lang>, from the udgam_lang cookie).
export default function FieldHomeError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useDocLang();
  const retry = useRetry(reset);
  return <HomeError lang={lang} onRetry={retry} />;
}

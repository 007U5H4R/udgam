'use client';

import { useDocLang, useRetry } from '../../../../../components/field/route-error';
import { PickingsError } from '../PickingsStates';

// /field/pickings when rendering failed (Design.md §18): what happened, that saved pickings are safe on
// this phone, and Try again, in the agent's language (<html lang>, from the udgam_lang cookie).
export default function PickingsRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useDocLang();
  const retry = useRetry(reset);
  return <PickingsError lang={lang} onRetry={retry} />;
}

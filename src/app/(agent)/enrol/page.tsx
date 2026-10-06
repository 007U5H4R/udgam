import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { throwIfForced } from '../../../lib/config/test-surfaces';
import { isLang, LANG_COOKIE } from '../../../lib/i18n';
import { requireSession } from '../../_auth/require';
import { EnrolClient } from './EnrolClient';

// /enrol (technical-plan §3.2, TKT-05). No mockup: composed from ported components (TP17). The first-run
// language sheet shows while the `udgam_lang` cookie is unset (TC-025).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up this phone · Udgam' };

export default async function EnrolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession('agent');
  throwIfForced((await searchParams).state); // dev and e2e only: shows /enrol's error boundary (CR-100)
  const lang = (await cookies()).get(LANG_COOKIE)?.value;
  return <EnrolClient initialLang={isLang(lang) ? lang : null} />;
}

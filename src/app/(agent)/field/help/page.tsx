import type { Metadata } from 'next';
import { requireSession } from '../../../_auth/require';
import { renderFieldHome } from '../home';

// /field/help — a deep link to Help (technical-plan §3.2, TSK-11.6, TC-053): Home with the Help sheet
// (final/index.html #help-dialog) open over it. Closing the sheet returns to /field.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Help · Udgam' };

export default async function FieldHelp({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const agent = await requireSession('agent');
  return renderFieldHome(agent, searchParams, { helpOpen: true });
}

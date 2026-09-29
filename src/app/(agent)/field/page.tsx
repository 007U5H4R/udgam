import { requireSession } from '../../_auth/require';
import { PlaceholderShell } from '../../_shell/PlaceholderShell';

// /field — TEMPORARY landing for a signed-in agent (TKT-04) until TKT-10 ports Home (index.html #s1)
// into this file.
export const dynamic = 'force-dynamic';

export default async function FieldHome() {
  await requireSession('agent');
  return <PlaceholderShell title="shell.field.title" empty="shell.field.empty" />;
}

import { requireSession } from '../../_auth/require';
import { PlaceholderShell } from '../../_shell/PlaceholderShell';

// /buyer — placeholder list shell until TKT-14 builds the buyer list (with listBuyerBatches from
// src/lib/auth/org-scope.ts, scoped by the session's orgId).
export const dynamic = 'force-dynamic';

export default async function BuyerHome() {
  await requireSession('buyer');
  return <PlaceholderShell title="shell.buyer.title" empty="shell.buyer.empty" />;
}

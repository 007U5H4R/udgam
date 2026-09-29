import type { ReactNode } from 'react';
import { requireSession } from '../_auth/require';

// Signed-in surfaces are per request: never prerendered or cached.
export const dynamic = 'force-dynamic';

// (buyer) route group: every page below renders only for a signed-in buyer (technical-plan §10,
// TC-018). Pages that read data and Server Actions guard themselves as well: Next renders a layout and
// its page concurrently, and a layout never protects an action.
export default async function BuyerLayout({ children }: { children: ReactNode }) {
  await requireSession('buyer');
  return children;
}

import type { ReactNode } from 'react';
import { requireSession } from '../_auth/require';
import { AdminDocument } from './AdminDocument';

// Signed-in surfaces are per request: never prerendered or cached.
export const dynamic = 'force-dynamic';

// (admin) route group: every page below renders only for a signed-in FPO admin (technical-plan §10,
// TC-018). Pages that read data and Server Actions guard themselves as well: Next renders a layout and
// its page concurrently, and a layout never protects an action. AdminDocument reloads an admin page that
// was reached by a client navigation from a non-admin document, so it runs under the admin CSP.
export default async function AdminLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  await requireSession('admin');
  return <AdminDocument>{children}</AdminDocument>;
}

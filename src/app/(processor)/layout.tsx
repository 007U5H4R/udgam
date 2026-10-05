import type { ReactNode } from 'react';
import { requireSession } from '../_auth/require';

// Signed-in surfaces are per request: never prerendered or cached.
export const dynamic = 'force-dynamic';

// (processor) route group (TKT-26, D9, Design.md §28.2): every page below renders only for a signed-in
// processor. Its own role and surface, not a scoped admin view: least privilege. Pages that read data and
// Server Actions guard themselves as well: Next renders a layout and its page concurrently, and a layout
// never protects an action.
export default async function ProcessorLayout({ children }: { children: ReactNode }) {
  await requireSession('processor');
  return children;
}

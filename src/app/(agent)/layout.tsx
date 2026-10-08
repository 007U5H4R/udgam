import type { ReactNode } from 'react';
import '../../styles/field.css';
import { OfflineSheet } from '../../components/field/OfflineSheet';
import { requireSession } from '../_auth/require';
import { langFromCookies } from './field/route-state';

// Signed-in surfaces are per request: never prerendered or cached.
export const dynamic = 'force-dynamic';

// (agent) route group: every page below renders only for a signed-in agent (technical-plan §10,
// TC-018). Pages that read data and Server Actions guard themselves as well: Next renders a layout and
// its page concurrently, and a layout never protects an action.
export default async function AgentLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  await requireSession('agent');
  // DES-002 (EXE40): with no network a tap that would leave the page shows the saved-on-phone sheet instead.
  return (
    <>
      {children}
      <OfflineSheet lang={await langFromCookies()} />
    </>
  );
}

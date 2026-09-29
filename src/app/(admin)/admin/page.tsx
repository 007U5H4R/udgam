import { requireSession } from '../../_auth/require';
import { PlaceholderShell } from '../../_shell/PlaceholderShell';

// /admin — placeholder shell until TKT-12 ports the review queue (admin.html).
export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  await requireSession('admin');
  return <PlaceholderShell title="shell.admin.title" empty="shell.admin.empty" />;
}

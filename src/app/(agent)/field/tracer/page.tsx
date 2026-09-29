import { requireSession } from '../../../_auth/require';
import { TracerClient } from './TracerClient';

// TEMPORARY (TKT-02 tracer bullet; removed by TKT-10). A server page so it can guard itself like every
// group page (tests/guard-coverage.test.ts); the capture UI is the client component.
export const dynamic = 'force-dynamic';

export default async function TracerPage() {
  await requireSession('agent');
  return <TracerClient />;
}

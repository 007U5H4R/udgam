import type { Metadata } from 'next';
import { requireSession } from '../../../_auth/require';
import { renderFieldHome } from '../home';

// /field — the capture Home (technical-plan §3.2, final/index.html #s1, TSK-10.5); rendered by home.tsx,
// which /field/help shares (TSK-11.6). The (home) group keeps Home's loading and error states to Home: a
// loading boundary above /field/pickings/[eventId] would start the stream before its notFound(), and a
// picking that is not this agent's must answer 404, not 200 (TKT-11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Home · Udgam' };

export default async function FieldHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const agent = await requireSession('agent');
  return renderFieldHome(agent, searchParams);
}

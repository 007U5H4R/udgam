import { notFound } from 'next/navigation';
import { env } from '../../lib/config/env';

// Test-only surfaces live under /__test__/* (the folder is `%5F_test__` because Next.js treats a
// leading underscore as a private, unrouted folder). They answer 404 unless E2E=1 (technical-plan §1).
export function requireTestSurface(): void {
  if (env.E2E !== '1') notFound();
}

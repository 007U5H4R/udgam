// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.

/** Reported: a non-public API route with no guard. */
export async function GET() {
  return new Response('[]');
}

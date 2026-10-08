// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.

/** Not reported: api/health is public. */
export async function GET() {
  return new Response('ok');
}

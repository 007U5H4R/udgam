'use client';

// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.

/** Reported: a client page cannot await the guard; it must be rendered from a server page that does. */
export default function ClientPage() {
  return null;
}

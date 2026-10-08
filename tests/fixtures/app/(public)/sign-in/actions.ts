'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.

/** Not reported: (public)/sign-in/actions.ts is the one allowlisted public action file. */
export async function signIn() {
  return { error: null };
}

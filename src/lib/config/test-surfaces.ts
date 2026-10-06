import { realDeployment, type DeploymentGate } from './deployment';
import { env } from './env';

// The test-only surfaces (technical-plan §1 and §11): `?state=…` forced view states and `?state=throw`,
// which make every loading, empty and error state, and every route's error boundary, reachable for e2e
// and design review. ONE rule decides when they are honoured (CR-104): outside production, or on the
// Playwright server (E2E=1, a production build; never set in a real deployment, EXE12/EXE33). SERVER-ONLY
// (reads env). Each screen keeps its own whitelist of states and calls `forcedState` with it.

type Gate = DeploymentGate;

/** Whether the test-only surfaces are on: outside production, or with E2E=1. */
export function testSurfacesOn(e: Gate = env): boolean {
  return !realDeployment(e);
}

/** `v` when it is one of `allowed` and the test surfaces are on; otherwise null. */
export function forcedState<const T extends string>(v: unknown, allowed: readonly T[], e: Gate = env): T | null {
  if (!testSurfacesOn(e)) return null;
  return allowed.find((s) => s === v) ?? null;
}

/** `?state=throw`: the page throws, so its route's error boundary (error.tsx) shows (EVAL-088). */
export function throwIfForced(v: unknown, e: Gate = env): void {
  if (testSurfacesOn(e) && v === 'throw') throw new Error('forced_route_error');
}

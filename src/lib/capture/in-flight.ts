import { MAX_CAPTURES_IN_FLIGHT } from './limits';

// The per-process cap on capture requests in flight (TASK-20 fix round 1). The count lives on
// globalThis, like src/lib/db/client.ts's state, so the one process has one count however many times a
// bundler instantiates this module.

type State = { inFlight: number };
const KEY = Symbol.for('udgam.capture.in-flight');
const state: State = ((globalThis as Record<symbol, unknown>)[KEY] as State | undefined) ?? ((globalThis as Record<symbol, unknown>)[KEY] = { inFlight: 0 } satisfies State);

/**
 * Take a capture slot: a release function (idempotent) when one is free, null when MAX_CAPTURES_IN_FLIGHT
 * requests already hold one.
 */
export function acquireCaptureSlot(): (() => void) | null {
  if (state.inFlight >= MAX_CAPTURES_IN_FLIGHT) return null;
  state.inFlight++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.inFlight--;
  };
}

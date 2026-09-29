import { MAX_CAPTURES_IN_FLIGHT, MAX_CAPTURES_PER_AGENT } from './limits';

// The per-process cap on capture requests in flight (TASK-20 fix round 1), with a per-agent share
// (fix round 2, N2). The counts live on globalThis, like src/lib/db/client.ts's state, so the one process
// has one count however many times a bundler instantiates this module.

type State = { inFlight: number; perAgent: Map<string, number> };
const KEY = Symbol.for('udgam.capture.in-flight.v2');
const state: State =
  ((globalThis as Record<symbol, unknown>)[KEY] as State | undefined) ??
  ((globalThis as Record<symbol, unknown>)[KEY] = { inFlight: 0, perAgent: new Map() } satisfies State);

export type SlotResult = { ok: true; release: () => void } | { ok: false; scope: 'agent' | 'global' };

/**
 * Take a capture slot for `agentId`: a release function (idempotent) when one is free; a refusal when
 * this agent already holds MAX_CAPTURES_PER_AGENT (`agent`) or all MAX_CAPTURES_IN_FLIGHT are taken
 * (`global`).
 */
export function acquireCaptureSlot(agentId: string): SlotResult {
  const mine = state.perAgent.get(agentId) ?? 0;
  if (mine >= MAX_CAPTURES_PER_AGENT) return { ok: false, scope: 'agent' };
  if (state.inFlight >= MAX_CAPTURES_IN_FLIGHT) return { ok: false, scope: 'global' };
  state.inFlight++;
  state.perAgent.set(agentId, mine + 1);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      state.inFlight--;
      const left = (state.perAgent.get(agentId) ?? 1) - 1;
      if (left > 0) state.perAgent.set(agentId, left);
      else state.perAgent.delete(agentId);
    },
  };
}

/** What is in flight now: the total and the count per agent (for tests and diagnostics). */
export function capturesInFlight(): { total: number; agents: Record<string, number> } {
  return { total: state.inFlight, agents: Object.fromEntries(state.perAgent) };
}

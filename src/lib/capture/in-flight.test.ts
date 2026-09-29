import { afterEach, describe, expect, it } from 'vitest';
import { acquireCaptureSlot, capturesInFlight } from './in-flight';
import { BODY_READ_DEADLINE_MS, BUSY_RETRY_AFTER_SEC, MAX_CAPTURES_IN_FLIGHT, MAX_CAPTURES_PER_AGENT } from './limits';

// TASK-20 fix round 2 (N2): the process-wide cap stays at 4, and one agent holds at most 2 of the slots,
// so one agent's slow uploads cannot take every slot.

const held: (() => void)[] = [];
function take(agent: string) {
  const r = acquireCaptureSlot(agent);
  if (r.ok) held.push(r.release);
  return r;
}
afterEach(() => {
  held.splice(0).forEach((release) => release());
});

describe('capture slots', () => {
  it('the limits: 4 in flight, 2 per agent, a busy answer asks for 5 s, a body has 60 s to arrive', () => {
    expect(MAX_CAPTURES_IN_FLIGHT).toBe(4);
    expect(MAX_CAPTURES_PER_AGENT).toBe(2);
    expect(BUSY_RETRY_AFTER_SEC).toBe(5);
    expect(BODY_READ_DEADLINE_MS).toBe(60_000);
  });

  it('one agent gets at most 2 slots; the others stay free for other agents', () => {
    expect(take('AG-A').ok).toBe(true);
    expect(take('AG-A').ok).toBe(true);
    expect(take('AG-A')).toEqual({ ok: false, scope: 'agent' });
    expect(capturesInFlight()).toEqual({ total: 2, agents: { 'AG-A': 2 } });
    expect(take('AG-B').ok).toBe(true);
    expect(take('AG-C').ok).toBe(true);
    expect(capturesInFlight()).toEqual({ total: 4, agents: { 'AG-A': 2, 'AG-B': 1, 'AG-C': 1 } });
  });

  it('past 4 in all, everyone is refused, an agent under its own cap included', () => {
    take('AG-A');
    take('AG-A');
    take('AG-B');
    take('AG-B');
    expect(take('AG-C')).toEqual({ ok: false, scope: 'global' });
    expect(take('AG-A')).toEqual({ ok: false, scope: 'agent' });
  });

  it('a release frees both counts once, however often it is called; an agent with nothing in flight is forgotten', () => {
    const a1 = take('AG-A');
    take('AG-A');
    if (!a1.ok) throw new Error('slot');
    a1.release();
    a1.release();
    expect(capturesInFlight()).toEqual({ total: 1, agents: { 'AG-A': 1 } });
    expect(take('AG-A').ok).toBe(true);
    held.splice(0).forEach((release) => release());
    expect(capturesInFlight()).toEqual({ total: 0, agents: {} });
  });
});

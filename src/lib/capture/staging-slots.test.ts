import { afterEach, describe, expect, it } from 'vitest';
import { acquireStageSlot, MAX_STAGES_IN_FLIGHT, MAX_STAGES_PER_AGENT } from './staging';

// The photo staging slots (TSK-30.2) and their fair share (SEC-004, Stage 10). A phone stages at most two
// photos at a time (stage-client.ts), so an agent holds at most 2 slots, a quarter of the pool of 8: two
// accounts trickling bodies no longer hold every slot (it takes four), and other agents still stage.

const held: (() => void)[] = [];
function take(agent: string): boolean {
  const r = acquireStageSlot(agent);
  if (r.ok) held.push(r.release);
  return r.ok;
}
afterEach(() => {
  held.splice(0).forEach((release) => release());
});

describe('stage slots', () => {
  it('the limits: 8 in flight, 2 per agent (a quarter of the pool)', () => {
    expect(MAX_STAGES_IN_FLIGHT).toBe(8);
    expect(MAX_STAGES_PER_AGENT).toBe(2);
    expect(MAX_STAGES_PER_AGENT * 4).toBe(MAX_STAGES_IN_FLIGHT);
  });

  it('one agent stages two photos at once, not three', () => {
    expect([take('AG-A'), take('AG-A'), take('AG-A')]).toEqual([true, true, false]);
  });

  it('SEC-004 probe p2: two agents asking for every slot they can get leave the others free', () => {
    expect([take('AG-A'), take('AG-A'), take('AG-A'), take('AG-B'), take('AG-B'), take('AG-B')]).toEqual([true, true, false, true, true, false]);
    expect([take('AG-C'), take('AG-C')]).toEqual([true, true]); // two concurrent phones both stage both photos
  });

  it('past 8 in all, everyone is refused', () => {
    for (const a of ['AG-A', 'AG-B', 'AG-C', 'AG-D']) expect([take(a), take(a)]).toEqual([true, true]);
    expect(take('AG-E')).toBe(false);
  });

  it('a release is counted once, however often it is called', () => {
    const a = acquireStageSlot('AG-A');
    if (!a.ok) throw new Error('slot');
    a.release();
    a.release();
    expect([take('AG-A'), take('AG-A')]).toEqual([true, true]);
    for (const x of ['AG-B', 'AG-C', 'AG-D']) expect([take(x), take(x)]).toEqual([true, true]);
    expect(take('AG-E')).toBe(false);
  });
});

import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * chain_continuity (§6.3, TP10): each phone's captures form a chain. ok when `seq = lastSeq + 1` and
 * `prevEventHash` is the phone's chain head (the payload hash of its last accepted event), or on genesis
 * (seq 1, `genesis`) for a phone with no chain yet and an agent with no accepted entries anywhere. flag
 * on any gap, stale hash or replayed old position, and on genesis on a new phone when the agent already
 * has accepted entries on another one (re-enrolment, EVAL-021). Never fails: a chain break is a reason to
 * look, not proof (a lost phone or cleared storage breaks it honestly).
 */
export const chainContinuity: Check = {
  id: 'chain_continuity',
  kind: 'local',
  async run(sub, ctx) {
    const id = 'chain_continuity' as const;
    const { seq, prevEventHash } = sub.payload;
    const { lastSeq, lastEventHash } = ctx.device;
    const expected = lastSeq + 1;
    const head = lastEventHash ?? 'genesis';

    if (seq !== expected || prevEventHash !== head) {
      return { id, status: 'flag', hardFail: false, evidence: evidence.chain_continuity.flag({ reason: 'out_of_order', expected, prevHash: head, seq }) };
    }
    if (lastEventHash === null && ctx.agentPriorAcceptedEvents > 0) {
      return { id, status: 'flag', hardFail: false, evidence: evidence.chain_continuity.flag({ reason: 'new_device', priorEntries: ctx.agentPriorAcceptedEvents }) };
    }
    return { id, status: 'ok', hardFail: false, evidence: evidence.chain_continuity.ok({ seq }) };
  },
};

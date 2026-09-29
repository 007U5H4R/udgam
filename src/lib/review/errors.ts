import type { ReasonCode } from './reason';

// Refusals of the review services (technical-plan TSK-12.4/12.5). Each names what the admin can act on;
// nothing was written. The HTTP-like status is what the Server Action reports (a 409 for a state that
// forbids the change, TC-056). A database trigger's RAISE(ABORT) is mapped to the same codes, so a raw
// database error never reaches the screen (EXE16).

export type ReviewErrorCode = 'not_found' | 'not_reviewable' | 'hard_fail_final' | 'already_decided' | 'batched' | 'nothing_to_rerun' | ReasonCode;

export const REVIEW_STATUS: Record<ReviewErrorCode, number> = {
  not_found: 404,
  not_reviewable: 409,
  hard_fail_final: 409,
  already_decided: 409,
  batched: 409,
  nothing_to_rerun: 409,
  reason_too_short: 400,
  reason_too_long: 400,
  reason_has_phone: 400,
};

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code);
    this.name = 'ReviewError';
  }

  get status(): number {
    return REVIEW_STATUS[this.code];
  }
}

/** The messages along an error's cause chain (drizzle wraps the libSQL error). */
function messages(err: unknown): string {
  const out: string[] = [];
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if (e instanceof Error) out.push(e.message);
  }
  return out.join(' | ');
}

/** The refusal a database guard (admin_override_guards, batch invariants) raised, or null for anything else. */
export function refusalFromDb(err: unknown): ReviewErrorCode | null {
  const m = messages(err);
  if (m.includes('hard-failed run cannot be overridden')) return 'hard_fail_final';
  if (m.includes('event is in a batch')) return 'batched';
  if (m.includes('decided by an admin') || m.includes('override already exists') || m.includes('admin_overrides.run_id')) return 'already_decided';
  if (m.includes('only the latest run') || m.includes('verification run already exists') || m.includes('verification_runs.event_id')) return 'not_reviewable';
  return null;
}

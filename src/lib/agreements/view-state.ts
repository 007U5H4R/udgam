import { env } from '../config/env';

// Forced view states for the agreement screens (technical-plan §11, Design.md §28.6). Server-only:
// reads env. `?state=loading|empty|error` reaches the view states, `?state=working` the action in
// progress and `?state=turned-away` the action error when the ledger refuses (the e2e server has no
// chain to refuse), so e2e can reach every state; disabled in production builds unless E2E=1.

const STATES = ['loading', 'empty', 'error', 'working', 'turned-away'] as const;
export type AgreementViewState = (typeof STATES)[number];

export function forcedAgreementState(param: unknown): AgreementViewState | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return STATES.find((s) => s === param) ?? null;
}

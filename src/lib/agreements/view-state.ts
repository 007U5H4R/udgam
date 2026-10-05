import { env } from '../config/env';

// Forced view states for the agreement screens (technical-plan §11, Design.md §28.6). Server-only:
// reads env. `?state=loading|empty|error` reaches the view states and `?state=working` the action in
// progress, so e2e can reach every state; disabled in production builds unless E2E=1.

export type AgreementViewState = 'loading' | 'empty' | 'error' | 'working';

export function forcedAgreementState(param: unknown): AgreementViewState | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return param === 'loading' || param === 'empty' || param === 'error' || param === 'working' ? param : null;
}

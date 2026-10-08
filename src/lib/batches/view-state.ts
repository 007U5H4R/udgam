import { forcedState } from '../config/test-surfaces';

// Forced view states for the batch screens (technical-plan §11). Server-only: reads env.

export type ViewState = 'loading' | 'empty' | 'error';

/**
 * A view state forced with `?state=loading|empty|error`, so e2e can reach every state (technical-plan
 * §11). Disabled in production builds unless E2E=1 (the Playwright server; CR-104: one rule).
 */
export function forcedViewState(param: unknown): ViewState | null {
  return forcedState(param, ['loading', 'empty', 'error']);
}

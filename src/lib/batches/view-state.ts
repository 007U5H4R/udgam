import { env } from '../config/env';

// Forced view states for the batch screens (technical-plan §11). Server-only: reads env.

export type ViewState = 'loading' | 'empty' | 'error';

/**
 * A view state forced with `?state=loading|empty|error`, so e2e can reach every state (technical-plan
 * §11). Disabled in production builds unless E2E=1 (the Playwright server).
 */
export function forcedViewState(param: unknown): ViewState | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return param === 'loading' || param === 'empty' || param === 'error' ? param : null;
}

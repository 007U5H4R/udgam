import { env } from '../../../../lib/config/env';

// `?state=loading|empty|error` makes each data-backed state reachable for review and e2e
// (technical-plan §11). Off in a production build unless the e2e server runs it (E2E=1).

export type ViewState = 'working' | 'loading' | 'empty' | 'error';

export function forcedState(param: string | string[] | undefined): ViewState | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  return param === 'loading' || param === 'empty' || param === 'error' ? param : null;
}

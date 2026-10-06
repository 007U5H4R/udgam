import { forcedState as forced } from '../../../../lib/config/test-surfaces';

// `?state=loading|empty|error` makes each data-backed state reachable for review and e2e
// (technical-plan §11). Off in a production build unless the e2e server runs it (E2E=1; CR-104: the
// one rule in lib/config/test-surfaces.ts).

export type ViewState = 'working' | 'loading' | 'empty' | 'error';

const FORCEABLE = ['loading', 'empty', 'error'] as const;

export function forcedState(param: string | string[] | undefined): ViewState | null {
  return forced(param, FORCEABLE);
}

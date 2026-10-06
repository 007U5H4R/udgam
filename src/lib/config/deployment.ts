// The one rule for "is this a real deployment?" (CR-104, SEC-007, DES-219): a production server that is
// not the Playwright server. E2E=1 runs `next build && next start` (so NODE_ENV=production) on localhost
// and is never set in a real deployment (EXE12, EXE33). Pure: takes the variables, reads nothing, so
// env.ts can use it while it validates.

export type DeploymentGate = { NODE_ENV: string; E2E?: string | undefined };

export function realDeployment(e: DeploymentGate): boolean {
  return e.NODE_ENV === 'production' && e.E2E !== '1';
}

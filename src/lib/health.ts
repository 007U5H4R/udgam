export type ProviderStatus = 'ok' | 'error' | 'fixture' | 'unprobed';

export interface LedgerHealth {
  lastSeq: number | null;
  lastCheckpointAgeSec: number | null;
  keyPresent: boolean;
  /** A checkpoint carries a kid that is not published (lost or replaced ledger key): 503. */
  keyMismatch: boolean;
}

export interface HealthBody {
  /** Present when the route reports it: 'error' when the environment failed validation (QA-P1-1). */
  config?: 'ok' | 'error';
  /** 'unchecked' when the configuration is invalid, so the database could not be located. */
  db: 'ok' | 'error' | 'unchecked';
  /** Added by TKT-15; absent until the ledger exists. */
  ledger?: LedgerHealth;
  providers: { gfw: ProviderStatus; sentinelHub: ProviderStatus };
  version: string;
  commit: string;
}

export interface HealthDeps {
  ping(): Promise<void>;
  version: string;
  commit: string;
  /** Defaults to the fixture provider. TKT-07 supplies real probes. */
  providers?: HealthBody['providers'];
  ledger?: LedgerHealth;
  /** 'error' skips the database ping (it cannot be located) and answers 503. */
  config?: 'ok' | 'error';
}

/**
 * Pure health core (technical-plan §15). Takes everything it needs as arguments and reads no
 * environment, so a body can never carry an env value.
 */
export async function health(deps: HealthDeps): Promise<{ status: 200 | 503; body: HealthBody }> {
  let db: HealthBody['db'] = 'ok';
  if (deps.config === 'error') {
    db = 'unchecked';
  } else {
    try {
      await deps.ping();
    } catch {
      db = 'error';
    }
  }
  const body: HealthBody = {
    ...(deps.config ? { config: deps.config } : {}),
    db,
    ...(deps.ledger ? { ledger: deps.ledger } : {}),
    providers: deps.providers ?? { gfw: 'fixture', sentinelHub: 'fixture' },
    version: deps.version,
    commit: deps.commit,
  };
  const ok = db === 'ok' && (deps.ledger ? deps.ledger.keyPresent && !deps.ledger.keyMismatch : true);
  return { status: ok ? 200 : 503, body };
}

export type ProviderStatus = 'ok' | 'error' | 'fixture' | 'unprobed';

export interface LedgerHealth {
  lastSeq: number | null;
  lastCheckpointAgeSec: number | null;
  keyPresent: boolean;
}

export interface HealthBody {
  db: 'ok' | 'error';
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
}

/**
 * Pure health core (technical-plan §15). Takes everything it needs as arguments and reads no
 * environment, so a body can never carry an env value.
 */
export async function health(deps: HealthDeps): Promise<{ status: 200 | 503; body: HealthBody }> {
  let db: HealthBody['db'] = 'ok';
  try {
    await deps.ping();
  } catch {
    db = 'error';
  }
  const body: HealthBody = {
    db,
    ...(deps.ledger ? { ledger: deps.ledger } : {}),
    providers: deps.providers ?? { gfw: 'fixture', sentinelHub: 'fixture' },
    version: deps.version,
    commit: deps.commit,
  };
  const ok = db === 'ok' && (deps.ledger ? deps.ledger.keyPresent : true);
  return { status: ok ? 200 : 503, body };
}

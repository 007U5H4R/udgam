import { sql } from 'drizzle-orm';
import pkg from '../../../../package.json';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { health, type HealthBody, type LedgerHealth } from '../../../lib/health';
import { ledgerHealth, ledgerKeyPresent } from '../../../lib/ledger/health';
import { log } from '../../../lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : 'unknown');

export async function GET(): Promise<Response> {
  // Configuration is read inside the try block: an invalid environment answers 503 with
  // config:"error" and a log line (QA-P1-1), not an unlogged 500 and not a database fault.
  let providers: HealthBody['providers'] = { gfw: 'unprobed', sentinelHub: 'unprobed' };
  let config: 'ok' | 'error' = 'ok';
  try {
    if (env.REMOTE_SENSING_PROVIDER === 'fixture') providers = { gfw: 'fixture', sentinelHub: 'fixture' };
    // else: real probes arrive with TKT-07
  } catch (err) {
    config = 'error';
    log.error({ errClass: errClass(err) }, 'health.config_invalid');
  }

  let ledger: LedgerHealth | undefined;
  if (config === 'ok') {
    try {
      ledger = await ledgerHealth(await getDbReady());
    } catch (err) {
      // The database is down: the ping below reports it. Key presence does not need the database.
      log.error({ errClass: errClass(err) }, 'health.ledger_failed');
      ledger = { lastSeq: null, lastCheckpointAgeSec: null, keyPresent: await ledgerKeyPresent(), keyMismatch: false };
    }
    if (!ledger.keyPresent) log.error('health.ledger_key_missing');
  }

  const { status, body } = await health({
    config,
    ping: async () => {
      try {
        await (await getDbReady()).run(sql`SELECT 1`);
      } catch (err) {
        log.error({ errClass: errClass(err) }, 'health.db_ping_failed');
        throw err;
      }
    },
    version: pkg.version,
    // Read directly, not via env.ts: a non-secret build constant that next.config.ts inlines at build
    // time. Real configuration and secrets must go through src/lib/config/env.ts.
    commit: process.env.UDGAM_COMMIT ?? 'unknown',
    providers,
    ledger,
  });
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

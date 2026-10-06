import { sql } from 'drizzle-orm';
import pkg from '../../../../package.json';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { health, type HealthBody, type LedgerHealth } from '../../../lib/health';
import { ledgerHealth, ledgerKeyPresent } from '../../../lib/ledger/health';
import { errFields, log } from '../../../lib/log';
import { providerHealth } from '../../../lib/remote-sensing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(): Promise<Response> {
  // Configuration is read inside the try block: an invalid environment answers 503 with
  // config:"error" and a log line (QA-P1-1), not an unlogged 500 and not a database fault.
  let providers: HealthBody['providers'] = { gfw: 'unprobed', sentinelHub: 'unprobed' };
  let config: 'ok' | 'error' = 'ok';
  try {
    // fixture mode: `fixture`; live: a GFW dataset GET and a CDSE token fetch, probed at most every 60 s (§15)
    providers = await providerHealth(env);
  } catch (err) {
    config = 'error';
    log.error(errFields(err), 'health.config_invalid');
  }

  let ledger: LedgerHealth | undefined;
  if (config === 'ok') {
    try {
      ledger = await ledgerHealth(await getDbReady());
    } catch (err) {
      // The database is down: the ping below reports it. Key presence does not need the database.
      log.error(errFields(err), 'health.ledger_failed');
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
        log.error(errFields(err), 'health.db_ping_failed');
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

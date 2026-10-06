import { sql } from 'drizzle-orm';
import pkg from '../../../../package.json';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { health, type HealthBody, type LedgerHealth } from '../../../lib/health';
import { diskHealth, type DiskStatus } from '../../../lib/health-disk';
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

  // SEC-003: free space on DATA_DIR. The numbers are logged, the public body says only ok/low/unknown.
  let disk: DiskStatus | undefined;
  if (config === 'ok') {
    const thresholdBytes = env.HEALTH_MIN_FREE_DISK_BYTES;
    const d = await diskHealth(env.DATA_DIR, thresholdBytes);
    disk = d.status;
    if (d.status === 'low') log.warn({ freeBytes: d.freeBytes, thresholdBytes }, 'health.disk_low');
    else if (d.status === 'unknown') log.warn('health.disk_unknown');
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
    disk,
  });
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

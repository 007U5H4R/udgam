import { sql } from 'drizzle-orm';
import pkg from '../../../../package.json';
import { env } from '../../../lib/config/env';
import { getDbReady } from '../../../lib/db/client';
import { health, type HealthBody } from '../../../lib/health';
import { log } from '../../../lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : 'unknown');

export async function GET(): Promise<Response> {
  // Configuration is read inside the try blocks: an invalid environment must answer 503 with a log
  // line, not an unlogged 500 from the framework.
  let providers: HealthBody['providers'] = { gfw: 'unprobed', sentinelHub: 'unprobed' };
  let configError: unknown;
  try {
    if (env.REMOTE_SENSING_PROVIDER === 'fixture') providers = { gfw: 'fixture', sentinelHub: 'fixture' };
    // else: real probes arrive with TKT-07
  } catch (err) {
    configError = err;
    log.error({ errClass: errClass(err) }, 'health.config_invalid');
  }

  const { status, body } = await health({
    ping: async () => {
      if (configError) throw configError;
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
  });
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

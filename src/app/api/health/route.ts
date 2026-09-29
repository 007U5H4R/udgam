import { sql } from 'drizzle-orm';
import pkg from '../../../../package.json';
import { env } from '../../../lib/config/env';
import { getDb } from '../../../lib/db/client';
import { health } from '../../../lib/health';
import { log } from '../../../lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { status, body } = await health({
    ping: async () => {
      try {
        await getDb().run(sql`SELECT 1`);
      } catch (err) {
        log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'health.db_ping_failed');
        throw err;
      }
    },
    version: pkg.version,
    commit: process.env.UDGAM_COMMIT ?? 'unknown',
    providers:
      env.REMOTE_SENSING_PROVIDER === 'fixture'
        ? { gfw: 'fixture', sentinelHub: 'fixture' }
        : { gfw: 'unprobed', sentinelHub: 'unprobed' }, // real probes arrive with TKT-07
  });
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

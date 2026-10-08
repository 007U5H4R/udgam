import { env } from '../config/env';
import { getDbReady } from '../db/client';
import { log } from '../log';
import { localStagingStore, sweepStaging } from './staging';

// At startup (instrumentation.ts, after the migrations): sweep staged photos left over from before this
// start, expired or orphaned by a crash (TKT-30 review #3). Best effort: a failure is logged, never fatal.

export async function sweepStagingAtBoot(): Promise<void> {
  try {
    const r = await sweepStaging(await getDbReady(), localStagingStore(env.DATA_DIR), new Date());
    if (r.expired + r.orphans > 0) log.info(r, 'stage.swept_at_boot');
  } catch (err) {
    log.warn({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'stage.sweep_failed');
  }
}

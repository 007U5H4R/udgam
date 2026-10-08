import { realDeployment, type DeploymentGate } from '../config/deployment';
import { env } from '../config/env';
import { getDbReady, writeTx, type Db } from '../db/client';
import { log } from '../log';
import { checkpointIfNeeded, type Checkpoint, type CheckpointOptions } from './checkpoint';

// Periodic hash-chain checkpoint (EXE54, TKT-28). Checkpoints are otherwise made on demand (a proof
// feed request, S7) or every 100th entry, so on a quiet day entries could stay unsealed until someone
// opened a certificate. This timer seals whatever is after the last checkpoint every
// LEDGER_CHECKPOINT_INTERVAL_SEC (default 1 h). SERVER-ONLY, one per process (the deployment runs one
// app instance). Each run is its own writeTx; a run never overlaps the previous one; a failure is logged
// and retried on the next tick. When nothing is unsealed, checkpointIfNeeded writes nothing.
//
// It starts from src/instrumentation.ts in a real deployment only: never under Vitest, `next dev` or the
// Playwright server (E2E=1, whose specs count on-demand checkpoints, EVAL-065). Tests start it directly.

const TIMER_KEY = Symbol.for('udgam.ledger.checkpoint-timer');

type Seal = (db: Db) => Promise<Checkpoint | null>;

/** Seal the entries after the last checkpoint in one write transaction (null when there are none). */
export function sealPending(db: Db, opts: CheckpointOptions = {}): Promise<Checkpoint | null> {
  return writeTx(db, (tx) => checkpointIfNeeded(tx, opts));
}

/** Whether the boot hook starts the timer: a real deployment only (src/lib/config/deployment.ts). */
export function checkpointTimerEnabled(e: DeploymentGate): boolean {
  return realDeployment(e);
}

/**
 * Run `seal` every `intervalMs` (first run one interval after the start). Returns a stop function. A
 * second start while a timer runs in this process is a no-op (its stop function does nothing).
 */
export function startCheckpointTimer(o: { intervalMs: number; getDb: () => Promise<Db>; opts?: CheckpointOptions; seal?: Seal }): () => void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[TIMER_KEY]) return () => undefined;
  const seal: Seal = o.seal ?? ((db) => sealPending(db, o.opts));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const cp = await seal(await o.getDb());
      if (cp) log.info({ id: cp.id, fromSeq: cp.fromSeq, toSeq: cp.toSeq }, 'ledger.checkpoint_sealed');
    } catch (err) {
      log.warn({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'ledger.checkpoint_timer_failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), o.intervalMs);
  timer.unref?.();
  g[TIMER_KEY] = timer;
  // One line at start, so a deployment's log shows the timer runs (a quiet ledger logs no seals).
  log.info({ intervalSec: o.intervalMs / 1000 }, 'ledger.checkpoint_timer_started');
  return () => {
    clearInterval(timer);
    if (g[TIMER_KEY] === timer) delete g[TIMER_KEY];
  };
}

/** Boot hook (src/instrumentation.ts): start the timer in a real deployment; a no-op anywhere else. */
export function startCheckpointsAtBoot(): void {
  if (!checkpointTimerEnabled(env)) return;
  startCheckpointTimer({ intervalMs: env.LEDGER_CHECKPOINT_INTERVAL_SEC * 1000, getDb: getDbReady });
}

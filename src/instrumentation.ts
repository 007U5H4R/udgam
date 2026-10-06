// Next.js boot hook: apply pending database migrations before the server handles requests
// (technical-plan TSK-02.4). Node runtime only; the edge runtime has no database.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // QA-P5-4: an invalid environment is logged (config.invalid) and the boot steps are skipped, so the
    // server stays up and /api/health answers 503 config:"error" instead of a bare 500 everywhere.
    const { configValidAtBoot } = await import('./lib/config/boot');
    if (!configValidAtBoot()) return;
    const { migrateAtBoot } = await import('./lib/db/migrate');
    await migrateAtBoot();
    // Staged photos left over from before this start (expired, or orphaned by a crash): TKT-30 review #3.
    const { sweepStagingAtBoot } = await import('./lib/capture/staging-boot');
    await sweepStagingAtBoot();
    // LEDGER_ADAPTER=evm: anchor pending entries now and in the background (TSK-24.6); no-op otherwise.
    const { startLedger } = await import('./lib/ledger');
    startLedger();
    // EXE54: seal unsealed ledger entries every LEDGER_CHECKPOINT_INTERVAL_SEC; real deployments only.
    const { startCheckpointsAtBoot } = await import('./lib/ledger/checkpoint-timer');
    startCheckpointsAtBoot();
  }
}

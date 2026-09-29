// Next.js boot hook: apply pending database migrations before the server handles requests
// (technical-plan TSK-02.4). Node runtime only; the edge runtime has no database.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrateAtBoot } = await import('./lib/db/migrate');
    await migrateAtBoot();
  }
}

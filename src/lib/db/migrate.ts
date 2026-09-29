import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { Db } from './client';

/**
 * The committed SQL migrations. Resolved from the working directory (the repo root for `next start`,
 * `pnpm db:migrate`, scripts and tests) because a bundled server module has no stable file URL.
 */
export const MIGRATIONS_DIR = resolve(process.cwd(), 'src/lib/db/migrations');

/** Apply every pending migration. Idempotent. */
export async function runMigrations(db: Db, migrationsFolder: string = MIGRATIONS_DIR): Promise<void> {
  await migrate(db, { migrationsFolder });
}

/**
 * Boot hook (src/instrumentation.ts): migrate the process-wide database before serving requests, then
 * refresh the reference data the verifier reads (the TP6 yield reference, TKT-09; idempotent).
 */
export async function migrateAtBoot(): Promise<void> {
  const { getDbReady } = await import('./client');
  await prepareDatabase(await getDbReady());
}

/** Migrate, then seed the reference data (idempotent). */
export async function prepareDatabase(db: Db, migrationsFolder: string = MIGRATIONS_DIR): Promise<void> {
  await runMigrations(db, migrationsFolder);
  const { seedYieldReference } = await import('./seed/yield-reference');
  await seedYieldReference(db);
}

// `pnpm db:migrate` (tsx src/lib/db/migrate.ts)
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { closeDb } = await import('./client');
  const { log } = await import('../log');
  try {
    await migrateAtBoot();
    log.info('db.migrated');
  } finally {
    closeDb();
  }
}

import { basename, resolve } from 'node:path';
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

/**
 * Whether this module is the command being run: `pnpm db:migrate` (tsx src/lib/db/migrate.ts) or the
 * image's bundle of it (migrate.mjs). The file name matters, not only the URL: a bundle of ANOTHER
 * command that imports this module (the image's accounts-create.mjs, deploy/build-tools.mjs) shares one
 * import.meta.url with its entry, and must not migrate and close the database under that command.
 */
export function isMigrateCommand(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1 || !/^migrate\.(ts|mjs)$/.test(basename(argv1))) return false;
  return moduleUrl === pathToFileURL(resolve(argv1)).href;
}

// `pnpm db:migrate` (tsx src/lib/db/migrate.ts), or `node migrate.mjs` in the image
if (isMigrateCommand(import.meta.url, process.argv[1])) {
  const { closeDb } = await import('./client');
  const { log } = await import('../log');
  try {
    await migrateAtBoot();
    log.info('db.migrated');
  } finally {
    closeDb();
  }
}

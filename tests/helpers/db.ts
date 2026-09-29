import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb, type Db } from '../../src/lib/db/client';

export interface TempDb {
  db: Db;
  client: Client;
  url: string;
  cleanup(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../src/lib/db/migrations', import.meta.url));

/**
 * A fresh libSQL file in os.tmpdir() with every committed migration applied.
 * (Until TKT-02 adds the first migration, the database is empty.)
 */
export async function tempDb(): Promise<TempDb> {
  const dir = await mkdtemp(join(tmpdir(), 'udgam-test-'));
  const url = `file:${join(dir, 'test.db')}`;
  const { db, client, ready } = createDb(url);
  await ready;
  if (existsSync(join(MIGRATIONS, 'meta', '_journal.json'))) {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  }
  return {
    db,
    client,
    url,
    async cleanup() {
      client.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

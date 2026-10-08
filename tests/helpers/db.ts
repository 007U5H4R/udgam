import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';
import { createDb, type Db } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { tempDirs } from './tmp';

export interface TempDb {
  db: Db;
  client: Client;
  url: string;
  /** The temporary directory holding the database; tests may put a media root under it. */
  dir: string;
  cleanup(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../src/lib/db/migrations', import.meta.url));

// Every directory tempDb makes is also swept when the importing test file finishes (QA-S10-001):
// `cleanup()` removes it straight away, but a module that cached DATA_DIR from an earlier test can
// recreate it afterwards (keys/users/*.jwk), and that copy would otherwise outlive the run.
const tempDir = tempDirs();

/** A fresh libSQL file in os.tmpdir() with every committed migration applied. */
export async function tempDb(): Promise<TempDb> {
  const dir = tempDir('udgam-test-');
  const url = `file:${join(dir, 'test.db')}`;
  const { db, client, ready } = createDb(url);
  await ready;
  await runMigrations(db, MIGRATIONS);
  return {
    db,
    client,
    url,
    dir,
    async cleanup() {
      client.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

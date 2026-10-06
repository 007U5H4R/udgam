import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// TSK-27.5: `pnpm db:backup` (deploy/db/backup.mjs) writes a consistent snapshot of the file database
// with libSQL's `VACUUM INTO`, while the app keeps the database open in WAL mode. The snapshot is one
// self-contained file (no -wal), mode 0600, under DATA_DIR/backups, and its path is the only output.

let dataDir: string;
let live: Client;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'db-backup-'));
  live = createClient({ url: `file:${join(dataDir, 'udgam.db')}` });
  await live.execute('PRAGMA journal_mode=WAL');
  await live.execute('CREATE TABLE ledger_entries (seq INTEGER PRIMARY KEY, entry_hash TEXT NOT NULL)');
  for (let i = 1; i <= 50; i++) await live.execute({ sql: 'INSERT INTO ledger_entries VALUES (?, ?)', args: [i, `h${i}`] });
});
afterEach(() => {
  live.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const backup = (args: string[] = [], env: Record<string, string> = { DATA_DIR: dataDir }) => {
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH ?? '' };
  return spawnSync('node', ['deploy/db/backup.mjs', ...args], { encoding: 'utf8', env: Object.assign(childEnv, env) });
};

describe('db:backup', () => {
  it('snapshots the open WAL database, rows not yet checkpointed included, into one 0600 file', async () => {
    // The live connection stays open, so the last rows sit in udgam.db-wal, not yet in the main file.
    const r = backup(['--label', 'nightly']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const path = r.stdout.trim();
    expect(path).toMatch(new RegExp(`^${dataDir}/backups/udgam-\\d{8}T\\d{6}Z-nightly\\.db$`));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(dataDir, 'backups'))).toEqual([path.split('/').pop()]); // no -wal or -shm beside it

    const snap = createClient({ url: `file:${path}` });
    try {
      expect((await snap.execute('PRAGMA integrity_check')).rows[0]![0]).toBe('ok');
      expect(Number((await snap.execute('SELECT count(*) FROM ledger_entries')).rows[0]![0])).toBe(50);
      expect((await snap.execute('PRAGMA journal_mode')).rows[0]![0]).not.toBe('wal');
    } finally {
      snap.close();
    }
  });

  it('honours DATABASE_URL and an explicit --out path, and never overwrites a file', () => {
    const out = join(dataDir, 'pre-deploy.db');
    expect(backup(['--out', out], { DATABASE_URL: `file:${join(dataDir, 'udgam.db')}` }).status).toBe(0);
    expect(statSync(out).size).toBeGreaterThan(0);
    const again = backup(['--out', out], { DATABASE_URL: `file:${join(dataDir, 'udgam.db')}` });
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('exists');
  });

  it('refuses a database that is not a local file, and a missing one', () => {
    const remote = backup([], { DATABASE_URL: 'libsql://example.turso.io' });
    expect(remote.status).toBe(1);
    expect(remote.stderr).toContain('file:');
    const missing = backup([], { DATA_DIR: join(dataDir, 'nope') });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('no database');
  });
});

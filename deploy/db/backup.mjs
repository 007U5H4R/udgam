#!/usr/bin/env node
// `pnpm db:backup` (TKT-27, TSK-27.5): a consistent snapshot of the app's file database.
//
// Usage: node deploy/db/backup.mjs [--label <word>] [--out <path>]
//   default output: DATA_DIR/backups/udgam-<UTC yyyymmddThhmmssZ>[-<label>].db
//
// libSQL's `VACUUM INTO` copies the database as one transaction sees it, rows still in the -wal file
// included, while the app keeps writing; the result is a single self-contained file. The database is
// DATABASE_URL, else file:DATA_DIR/udgam.db (default ./data), as src/lib/config/env.ts resolves it; only
// a local file can be snapshotted. The snapshot is 0600 and never overwrites a file. stdout carries the
// snapshot's path and nothing else; an error goes to stderr and exits 1.
//
// In the image it runs as /app/deploy/db/backup.mjs (deploy/cron/backup.sh, scripts/deploy.sh); in a
// checkout it uses the repository's node_modules.
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@libsql/client';

function fail(message) {
  console.error(`db:backup: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = opt('--label');
if (label !== undefined && !/^[a-z0-9-]{1,32}$/.test(label)) fail('--label takes lowercase letters, digits and dashes');

const dataDir = process.env.DATA_DIR || './data';
const url = process.env.DATABASE_URL || `file:${dataDir}/udgam.db`;
if (!url.startsWith('file:')) fail('only a local file: database can be snapshotted');
const dbPath = resolve(url.slice('file:'.length));
if (!existsSync(dbPath)) fail(`no database at ${dbPath}`);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const out = resolve(opt('--out') ?? join(dataDir, 'backups', `udgam-${stamp}${label ? `-${label}` : ''}.db`));
if (existsSync(out)) fail(`${out} exists; a snapshot never overwrites a file`);
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });

const db = createClient({ url: `file:${dbPath}` });
try {
  await db.execute('PRAGMA busy_timeout = 30000');
  await db.execute({ sql: 'VACUUM INTO ?', args: [out] });
} catch (err) {
  fail(`snapshot failed (${err?.code ?? err?.name ?? 'error'})`);
} finally {
  db.close();
}
chmodSync(out, 0o600);
console.log(out);

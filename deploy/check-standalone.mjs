#!/usr/bin/env node
// Check what `output: 'standalone'` put into the server artifact before it goes into the image (TSK-27.1).
//
// Usage: node deploy/check-standalone.mjs <standalone-dir> [--max-mb N]
//   standalone-dir  .next/standalone after `next build` (before public/ and .next/static are copied in)
//   --max-mb        the size budget in MB (default 150; a healthy build is about 70 MB)
//
// QA-M002-3: one unscoped dynamic path made Next trace the whole project into the server output. The
// runtime-path rule (src/lib/config/runtime-path.ts) fixed it; this keeps it fixed for the image. A
// failure is any of:
//   - a top-level entry other than the server, its modules, the migrations and the traced fixtures
//     (the whole-project symptom: plans, docs, tests, contracts end up beside server.js);
//   - a data, key or env file, wherever it is (scripts/ci/check-trace.mjs's rules, on the copied files
//     rather than the traces);
//   - more bytes than the budget.
// Paths only are printed, never contents. Exit 1 on a failure, 2 when the directory or server.js is missing.
import { lstatSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const mbAt = args.indexOf('--max-mb');
const maxMb = mbAt >= 0 ? Number(args[mbAt + 1]) : 150;

if (!dir || !Number.isFinite(maxMb) || maxMb <= 0) {
  console.error('usage: check-standalone.mjs <standalone-dir> [--max-mb N]');
  process.exit(2);
}
try {
  if (!statSync(join(dir, 'server.js')).isFile()) throw new Error('not a file');
} catch {
  console.error(`check-standalone: ${join(dir, 'server.js')} not found (build with output: 'standalone' first)`);
  process.exit(2);
}

/** What may sit beside server.js. `src` and `evals` hold only the traced migrations and fixtures. */
const TOP_LEVEL = new Set(['.next', 'node_modules', 'package.json', 'server.js', 'src', 'evals']);
const DATA_DIRS = new Set(['data', 'data-ci', '.e2e-data', '.secrets', 'keys']);
const ENV_OK = new Set(['.env.example', '.env.ci.example']);
const KEY_FILE = /\.(key|jwk|pem)$/i;

function reason(file) {
  const parts = file.split('/');
  const name = basename(file);
  const inModules = parts.includes('node_modules');
  if (!inModules && parts.slice(0, -1).some((p) => DATA_DIRS.has(p))) return 'a data or key directory';
  if ((name === '.env' || name.startsWith('.env.')) && !ENV_OK.has(name)) return 'an env file';
  if (KEY_FILE.test(name) && !inModules) return 'a key file';
  if (/\.(db|sqlite)(-wal|-shm)?$/i.test(name) && !inModules) return 'a database file';
  return null;
}

const hits = [];
let files = 0;
let bytes = 0;

for (const e of readdirSync(dir)) {
  if (!TOP_LEVEL.has(e)) hits.push(`${e} (not part of the server: the project was traced in)`);
}

function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
      continue;
    }
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue; // pnpm's links into node_modules/.pnpm; their targets are walked
    files++;
    bytes += st.size;
    const rel = relative(dir, p).split(sep).join('/');
    const why = reason(rel);
    if (why) hits.push(`${rel} (${why})`);
  }
}
walk(dir);

const mb = bytes / 1024 / 1024;
if (mb > maxMb) hits.push(`${mb.toFixed(1)} MB is over the ${maxMb} MB budget`);

if (hits.length > 0) {
  for (const h of hits) console.log(`::error::standalone output: ${h}`);
  process.exit(1);
}
console.log(`check-standalone: ${files} files, ${mb.toFixed(1)} MB, within the ${maxMb} MB budget`);

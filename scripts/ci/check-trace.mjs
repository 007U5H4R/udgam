#!/usr/bin/env node
// Fail when a server file trace lists a data, key or secret file (final branch review finding 1, TASK-25).
//
// Usage: node scripts/ci/check-trace.mjs [next-dir] [project-root]
//   next-dir      the build output (default .next)
//   project-root  what trace paths are reported relative to (default: the current directory)
// Run it right after `pnpm build`.
//
// Each .next/**/*.nft.json lists the files a server bundle needs at run time; `output: 'standalone'`
// (TKT-27) copies every one of them into the deployable artifact. A hit is any traced file:
//   - under data/, .e2e-data/ or .secrets/ (DATA_DIR defaults, the e2e data dir, the secrets dir);
//   - named .env or .env.* (except the committed .env.example and .env.ci.example);
//   - named *.key, *.jwk or *.pem outside node_modules (a private key, wherever DATA_DIR points).
// A hit prints the file and the trace that lists it (paths only, never contents) and exits 1. Exit 2
// when the build output or its trace files are missing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const nextDir = resolve(process.argv[2] ?? '.next');
const root = resolve(process.argv[3] ?? '.');

const DIRS = ['data', '.e2e-data', '.secrets'];
const ENV_OK = new Set(['.env.example', '.env.ci.example']);
const KEY_FILE = /\.(key|jwk|pem)$/i;

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function* traces(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* traces(p);
    else if (e.isFile() && e.name.endsWith('.nft.json')) yield p;
  }
}

/** Why `file` (relative to the project root, '/'-separated) must not be traced, or null. */
function reason(file) {
  const parts = file.split('/');
  const name = basename(file);
  if (DIRS.includes(parts[0])) return `under ${parts[0]}/`;
  if ((name === '.env' || name.startsWith('.env.')) && !ENV_OK.has(name)) return 'an env file';
  if (KEY_FILE.test(name) && !parts.includes('node_modules')) return 'a key file';
  return null;
}

if (!isDir(nextDir)) {
  console.error(`check-trace: ${nextDir} not found (build first)`);
  process.exit(2);
}

let count = 0;
const hits = [];
for (const nft of traces(nextDir)) {
  count++;
  const { files } = JSON.parse(readFileSync(nft, 'utf8'));
  for (const entry of files ?? []) {
    const file = relative(root, resolve(dirname(nft), entry)).split(sep).join('/');
    const why = reason(file);
    if (why) hits.push(`${file} (${why}) in ${relative(root, nft).split(sep).join('/')}`);
  }
}

if (count === 0) {
  console.error(`check-trace: no .nft.json under ${nextDir} (build first)`);
  process.exit(2);
}
if (hits.length > 0) {
  for (const h of hits) console.log(`::error::traced into the server output: ${h}`);
  process.exit(1);
}
console.log(`check-trace: ${count} trace files, no data, key or secret file traced`);

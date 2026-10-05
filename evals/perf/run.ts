// pnpm eval:perf — performance gates against a running server (technical-plan §13, TSK-16.10).
//
//   pnpm eval:perf --target=http://localhost:3000 --only=s4 [--runs=10] [--data-dir=./data | --path=/verify/B-…?h=…]
//
// --only=s4 (EVAL-071): seeds the 50-event S4 batch into the target server's DATA_DIR (--data-dir, default
// $DATA_DIR or ./data) unless --path names an existing certificate, then measures --runs cold loads (default
// 10) and writes evals/results/local/perf-s4-<sha>.json with provenance. Exits 1 when the gate fails.
// --only=s3 (EVAL-070, the capture budget) is TKT-29's; it is refused here. Never run in CI (needs a server).
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { appVersion, gitFacts } from '../harness/provenance';
import { RESULTS_DIR } from '../harness/results';
import { seedS4Batch } from './fixtures';
import { runS4 } from './s4-certificate';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit?.includes('=') ? hit.slice(hit.indexOf('=') + 1) : undefined;
}

function usage(message: string): never {
  console.error(`eval:perf: ${message}\nusage: pnpm eval:perf --target=<url> --only=s4 [--runs=<n>] [--data-dir=<dir> | --path=<certificate path>]`);
  process.exit(2);
}

const only = arg('only') ?? 's4';
const target = arg('target');
const runs = Number(arg('runs') ?? '10');
if (!target || !/^https?:\/\//.test(target)) usage('--target=<http(s) url> is required');
if (!Number.isInteger(runs) || runs < 1) usage('--runs must be a positive integer');
if (only === 's3') usage('S3 (EVAL-070) is measured by TKT-29 on the production host; only --only=s4 exists here');
if (only !== 's4') usage(`unknown --only=${only}`);

const started = Date.now();
const path = arg('path') ?? (await seedS4Batch(arg('data-dir') ?? process.env.DATA_DIR ?? './data')).path;
const result = await runS4({ target, path, runs });
const git = gitFacts();
const out = {
  ...result,
  provenance: {
    harness: { name: 'udgam-eval-perf', version: '0.1.0' },
    appVersion: appVersion(),
    git,
    environment: process.env.CI ? 'ci' : 'local',
    node: process.version,
    os: { platform: platform(), arch: arch() },
    timestampUtc: new Date().toISOString(),
    durationMs: Date.now() - started,
  },
};
const dir = join(RESULTS_DIR, 'local');
mkdirSync(dir, { recursive: true });
const file = join(dir, `perf-s4-${git.shortSha}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
const s = result.summary;
console.log(
  `S4 ${result.pass ? 'PASS' : 'FAIL'}: ${result.runs.length} runs, ${result.runs.filter((r) => r.finalState === 'verified').length} verified` +
    (s ? `, p50 ${s.p50} ms, p95 ${s.p95} ms, max ${s.max} ms (threshold ${s.thresholdMs} ms)` : '') +
    `\nwrote ${file}`,
);
process.exit(result.pass ? 0 : 1);

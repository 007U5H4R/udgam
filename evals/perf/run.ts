// pnpm eval:perf — performance gates against a running server (technical-plan §13, TSK-16.10).
//
//   pnpm eval:perf --target=http://localhost:3000 --only=s4 [--runs=10] [--data-dir=./data | --path=/verify/B-…?h=…]
//                  [--out=<file>]
//
// --only=s4 (EVAL-071): seeds the 50-event S4 batch into the target server's DATA_DIR (--data-dir, default
// $DATA_DIR or ./data) unless --path names an existing certificate, then measures --runs cold loads (default
// 10) and writes evals/results/local/perf-s4-<sha>.json with provenance and the host's hardware. --out
// writes it elsewhere instead (TSK-21.5: evals/results/baseline-perf-v1.json), never over an existing file.
// Exits 1 when the gate fails.
// --suite=s3 (or --only=s3; EVAL-070, the capture budget, TSK-29.1) runs evals/harness/perf-s3.ts: see its
// header for its flags. --suite is the same choice as --only; S4 stays the default. Never run in CI (needs a server).
import { existsSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { s3Cli, suiteOf, UsageError } from '../harness/perf-s3';
import { appVersion } from '../harness/provenance';
import { RESULTS_DIR } from '../harness/results';
import { treeState } from '../harness/tree-state';
import { seedS4Batch } from './fixtures';
import { hostHardware, writePerfResult } from './output';
import { runS4 } from './s4-certificate';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit?.includes('=') ? hit.slice(hit.indexOf('=') + 1) : undefined;
}

function usage(message: string): never {
  console.error(`eval:perf: ${message}\nusage: pnpm eval:perf --target=<url> [--only=s4 | --suite=s4] [--runs=<n>] [--data-dir=<dir> | --path=<certificate path>] [--out=<file>]`);
  process.exit(2);
}

let only: string;
try {
  only = suiteOf(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  usage(e.message);
}
if (only === 's3') process.exit(await s3Cli(process.argv.slice(2)));
const target = arg('target');
const runs = Number(arg('runs') ?? '10');
if (!target || !/^https?:\/\//.test(target)) usage('--target=<http(s) url> is required');
if (!Number.isInteger(runs) || runs < 1) usage('--runs must be a positive integer');
if (only !== 's4') usage(`unknown suite ${only} (s3 or s4)`);
const outArg = arg('out');
if (outArg !== undefined && outArg === '') usage('--out needs a file path');
// Refuse before seeding or measuring: a perf result is never rewritten.
if (outArg && existsSync(resolve(outArg))) usage(`refusing to overwrite ${outArg}: perf results are never rewritten`);

const started = Date.now();
const path = arg('path') ?? (await seedS4Batch(arg('data-dir') ?? process.env.DATA_DIR ?? './data')).path;
const result = await runS4({ target, path, runs });
// The tree as the release judges it: clean means no change but untracked formal outputs (tree-state.ts),
// so the baseline files written just before this run do not mark it dirty; the release requires
// git.commit = its HEAD and git.dirty = false.
const git = treeState();
const out = {
  ...result,
  provenance: {
    harness: { name: 'udgam-eval-perf', version: '0.1.0' },
    appVersion: appVersion(),
    git,
    environment: process.env.CI ? 'ci' : 'local',
    node: process.version,
    os: { platform: platform(), arch: arch() },
    hardware: hostHardware(),
    timestampUtc: new Date().toISOString(),
    durationMs: Date.now() - started,
  },
};
// The default ad-hoc file (git-ignored) is replaced on a re-run; an --out file is never overwritten.
const file = outArg ? writePerfResult(resolve(outArg), out) : writePerfResult(join(RESULTS_DIR, 'local', `perf-s4-${git.shortSha}.json`), out, { overwrite: true });
const s = result.summary;
console.log(
  `S4 ${result.pass ? 'PASS' : 'FAIL'}: ${result.runs.length} runs, ${result.runs.filter((r) => r.finalState === 'verified').length} verified` +
    (s ? `, p50 ${s.p50} ms, p95 ${s.p95} ms, max ${s.max} ms (threshold ${s.thresholdMs} ms)` : '') +
    (result.verify ? `\n  verify (proof-start → proof-final): p50 ${result.verify.p50} ms, max ${result.verify.max} ms (§18 budget ${result.verify.thresholdMs} ms, reported only)` : '') +
    (result.server ? `\n  server response (requestStart → responseStart): p50 ${result.server.p50} ms, max ${result.server.max} ms (reported only)` : '') +
    `\nwrote ${file}`,
);
process.exit(result.pass ? 0 : 1);

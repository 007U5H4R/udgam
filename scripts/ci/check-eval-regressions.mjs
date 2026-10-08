// Stage 9 CR-200 (EV14: "a regression on a critical case, or any CF, blocks merge").
// `pnpm eval` exits 1 when a gate fails or a critical condition fires; this check runs after it and fails
// the CI job when the run's comparison with the latest formal run (results.comparison.regressions) names a
// case whose dataset priority is `critical`. A regressed case missing from the dataset counts as critical
// (fail closed); a non-critical regression is a warning. It prints case IDs only.
//
// usage: node scripts/ci/check-eval-regressions.mjs [results.json [dataset.json]]
//   results.json  default: the newest evals/results/local/eval-run-*.json (what `pnpm eval` just wrote)
//   dataset.json  default: evals/eval-dataset.json
// Exit codes: 0 no critical regression; 1 a critical case regressed; 2 bad usage or an unreadable input.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const USAGE = 'usage: node scripts/ci/check-eval-regressions.mjs [results.json [dataset.json]]';
const LOCAL = join('evals', 'results', 'local');

function fail(message) {
  console.error(`check-eval-regressions: ${message}`);
  process.exit(2);
}

function newestLocalRun() {
  let names;
  try {
    names = readdirSync(LOCAL).filter((n) => /^eval-run-.*\.json$/.test(n));
  } catch {
    fail(`no ${LOCAL}/ directory: run \`pnpm eval\` first`);
  }
  if (names.length === 0) fail(`no eval-run-*.json in ${LOCAL}/: run \`pnpm eval\` first`);
  return names.map((n) => join(LOCAL, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`cannot read the ${what} ${path}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}

const args = process.argv.slice(2);
if (args.length > 2 || args.some((a) => a.startsWith('-'))) {
  console.error(USAGE);
  process.exit(2);
}
const resultsPath = args[0] ?? newestLocalRun();
const datasetPath = args[1] ?? join('evals', 'eval-dataset.json');
const results = readJson(resultsPath, 'results file');
const dataset = readJson(datasetPath, 'dataset');
const regressions = results?.comparison?.regressions;
if (!Array.isArray(regressions)) fail(`${resultsPath} has no comparison.regressions`);
if (!Array.isArray(dataset?.cases)) fail(`${datasetPath} has no cases`);

const priority = new Map(dataset.cases.map((c) => [c.id, c.priority]));
const against = results.comparison.previous?.file ?? 'no earlier formal run';
const critical = regressions.filter((id) => priority.get(id) === undefined || priority.get(id) === 'critical');
const other = regressions.filter((id) => !critical.includes(id));
if (other.length > 0) console.log(`::warning::regressed (not critical): ${other.join(', ')}`);
if (critical.length > 0) {
  console.log(`::error::regressed critical case(s) block merge (EV14): ${critical.join(', ')} (against ${against})`);
  process.exit(1);
}
console.log(`check-eval-regressions: no regressed case against ${against}${other.length > 0 ? ` that is critical (${other.length} non-critical)` : ''}`);

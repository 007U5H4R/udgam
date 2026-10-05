import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './provenance';
import { RESULTS_DIR } from './results';

// The EVAL test suites outside the harness (technical-plan §13, TSK-21.4; decisions.md TP20: integration
// and e2e tests carry EVAL- IDs in their titles and the release aggregator maps them).
//
//   pnpm eval:integration [--out-dir=<dir>] [--evm]   Vitest, every test whose full name holds an EVAL-NNN
//                                                     ID (unit + integration projects; --evm adds the evm
//                                                     project, which needs the pinned Foundry) → integration.json
//   pnpm eval:e2e [--out-dir=<dir>]                   Playwright, every EVAL-titled test of playwright.config.ts
//                                                     → e2e.json, then the demo specs (playwright.demo.config.ts,
//                                                     EVAL-073/074) → e2e-demo.json
//
// Each writes its runner's JSON report (default dir evals/results/local/, git-ignored; a stale report is
// removed first so a crashed run can never be read as this run's) and exits with the runner's code
// (non-zero when any EVAL test failed). `pnpm eval:release` reads the reports. Parallel agents set
// E2E_PORT, which both Playwright configs honour.

export const EVAL_TITLE_PATTERN = 'EVAL-[0-9]{3}';
export const SUITE_REPORTS = { integration: 'integration.json', e2e: 'e2e.json', 'e2e-demo': 'e2e-demo.json' } as const;
export type SuiteReport = keyof typeof SUITE_REPORTS;

export type SuiteCommand = { report: SuiteReport; file: string; command: string; args: string[]; env: Record<string, string> };

const bin = (name: string) => join(REPO_ROOT, 'node_modules', '.bin', name);

/** The runner invocations for one suite (pure: the release records them in its provenance). */
export function suiteCommands(suite: 'integration' | 'e2e', outDir: string, opts: { evm?: boolean } = {}): SuiteCommand[] {
  if (suite === 'integration') {
    const file = join(outDir, SUITE_REPORTS.integration);
    const projects = ['unit', 'integration', ...(opts.evm ? ['evm'] : [])].flatMap((p) => ['--project', p]);
    return [
      {
        report: 'integration',
        file,
        command: bin('vitest'),
        args: ['run', ...projects, '-t', EVAL_TITLE_PATTERN, '--reporter=default', '--reporter=json', `--outputFile.json=${file}`],
        env: {},
      },
    ];
  }
  const e2e = join(outDir, SUITE_REPORTS.e2e);
  const demo = join(outDir, SUITE_REPORTS['e2e-demo']);
  return [
    { report: 'e2e', file: e2e, command: bin('playwright'), args: ['test', '--grep', EVAL_TITLE_PATTERN, '--reporter=list,json'], env: { PLAYWRIGHT_JSON_OUTPUT_NAME: e2e } },
    {
      report: 'e2e-demo',
      file: demo,
      command: bin('playwright'),
      args: ['test', '-c', 'playwright.demo.config.ts', '--grep', EVAL_TITLE_PATTERN, '--reporter=list,json'],
      env: { PLAYWRIGHT_JSON_OUTPUT_NAME: demo },
    },
  ];
}

export type SuiteRun = { report: SuiteReport; file: string; command: string; exitCode: number };

/** Run a suite's commands in turn (each even if an earlier one failed); never throws on a test failure. */
export function runSuite(suite: 'integration' | 'e2e', outDir: string, opts: { evm?: boolean; env?: NodeJS.ProcessEnv } = {}): SuiteRun[] {
  mkdirSync(outDir, { recursive: true });
  return suiteCommands(suite, outDir, opts).map((c) => {
    rmSync(c.file, { force: true });
    const r = spawnSync(c.command, c.args, { cwd: REPO_ROOT, stdio: 'inherit', env: { ...(opts.env ?? process.env), ...c.env } });
    return { report: c.report, file: c.file, command: [c.command.replace(`${REPO_ROOT}/`, ''), ...c.args].join(' '), exitCode: r.status ?? 2 };
  });
}

export function parseSuiteArgs(argv: string[]): { suite: 'integration' | 'e2e'; outDir: string; evm: boolean } {
  const [suite, ...rest] = argv;
  if (suite !== 'integration' && suite !== 'e2e') throw new Error(`usage: tsx evals/harness/test-suites.ts integration|e2e [--out-dir=<dir>] [--evm]; got ${suite ?? 'nothing'}`);
  let outDir = join(RESULTS_DIR, 'local');
  let evm = false;
  for (const a of rest) {
    if (a.startsWith('--out-dir=') && a.length > '--out-dir='.length) outDir = resolve(a.slice('--out-dir='.length));
    else if (a === '--evm' && suite === 'integration') evm = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return { suite, outDir, evm };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = parseSuiteArgs(process.argv.slice(2));
    const runs = runSuite(a.suite, a.outDir, { evm: a.evm });
    for (const r of runs) console.log(`eval:${a.suite} — ${r.report}: exit ${r.exitCode}, report ${r.file}`);
    process.exitCode = runs.some((r) => r.exitCode !== 0) ? 1 : 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  }
}

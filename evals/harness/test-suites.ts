import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './provenance';
import { RESULTS_DIR } from './results';
import { treeState, type TreeState } from './tree-state';

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
// (non-zero when any EVAL test failed). Beside each report it writes a run record `<report>.run.json`:
// the commit and tree state (tree-state.ts) before and after the run, the command, the exit code and the
// report's SHA-256. `pnpm eval:release` reads the reports and accepts one only when its record ties it to
// the release's own commit on a clean tree, unaltered, with exit 0. Parallel agents set E2E_PORT, which
// both Playwright configs honour; a Playwright run whose port is already served is refused (exit 2),
// because outside CI Playwright would reuse that server, possibly built from other code.

export const EVAL_TITLE_PATTERN = 'EVAL-[0-9]{3}';
export const SUITE_REPORTS = { integration: 'integration.json', e2e: 'e2e.json', 'e2e-demo': 'e2e-demo.json' } as const;
export type SuiteReport = keyof typeof SUITE_REPORTS;

/** `port`: the Playwright web server's port (E2E_PORT, else the config's default: 3100 e2e, 3330 demo). */
export type SuiteCommand = { report: SuiteReport; file: string; command: string; args: string[]; env: Record<string, string>; port?: number };

const bin = (name: string) => join(REPO_ROOT, 'node_modules', '.bin', name);

/** The runner invocations for one suite (pure: the release records them in its provenance). */
export function suiteCommands(suite: 'integration' | 'e2e', outDir: string, opts: { evm?: boolean; env?: Record<string, string | undefined> } = {}): SuiteCommand[] {
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
  const port = (fallback: number) => Number((opts.env ?? process.env).E2E_PORT ?? fallback);
  return [
    { report: 'e2e', file: e2e, command: bin('playwright'), args: ['test', '--grep', EVAL_TITLE_PATTERN, '--reporter=list,json'], env: { PLAYWRIGHT_JSON_OUTPUT_NAME: e2e }, port: port(3100) },
    {
      report: 'e2e-demo',
      file: demo,
      command: bin('playwright'),
      args: ['test', '-c', 'playwright.demo.config.ts', '--grep', EVAL_TITLE_PATTERN, '--reporter=list,json'],
      env: { PLAYWRIGHT_JSON_OUTPUT_NAME: demo },
      port: port(3330),
    },
  ];
}

export type SuiteRun = { report: SuiteReport; file: string; command: string; exitCode: number };

/** The run record written beside a suite report. */
export type SuiteRunRecord = {
  schema: 'udgam-suite-run/1';
  report: SuiteReport;
  command: string;
  exitCode: number;
  /** Why the command was not run (exit 2), or null. */
  refused: string | null;
  /** SHA-256 of the report as the run left it; null when the run wrote none. */
  reportSha256: string | null;
  git: { before: TreeState; after: TreeState };
  startedAt: string;
  finishedAt: string;
};

export const sidecarPath = (reportFile: string) => reportFile.replace(/\.json$/, '.run.json');

/** Whether something already accepts connections on localhost:port. */
export function portInUse(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = createConnection({ host: '127.0.0.1', port });
    s.once('connect', () => {
      s.destroy();
      done(true);
    });
    s.once('error', () => done(false));
  });
}

const sha256OrNull = (file: string): string | null => {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};

/**
 * Run a suite's commands in turn (each even if an earlier one failed); never throws on a test failure.
 * Writes each report's run record. `commands`, `git` and `portInUse` are test hooks.
 */
export async function runSuite(
  suite: 'integration' | 'e2e',
  outDir: string,
  opts: { evm?: boolean; env?: NodeJS.ProcessEnv; commands?: SuiteCommand[]; git?: () => TreeState; portInUse?: (port: number) => Promise<boolean> } = {},
): Promise<SuiteRun[]> {
  mkdirSync(outDir, { recursive: true });
  const git = opts.git ?? (() => treeState());
  const runs: SuiteRun[] = [];
  for (const c of opts.commands ?? suiteCommands(suite, outDir, opts)) {
    rmSync(c.file, { force: true });
    rmSync(sidecarPath(c.file), { force: true });
    const startedAt = new Date().toISOString();
    const before = git();
    const command = [c.command.replace(`${REPO_ROOT}/`, ''), ...c.args].join(' ');
    let refused: string | null = null;
    let exitCode: number;
    if (c.port !== undefined && (await (opts.portInUse ?? portInUse)(c.port))) {
      refused = `port ${c.port} is already in use: Playwright would reuse that server, which may run other code; stop it or set E2E_PORT to a free port`;
      exitCode = 2;
    } else {
      exitCode = spawnSync(c.command, c.args, { cwd: REPO_ROOT, stdio: 'inherit', env: { ...(opts.env ?? process.env), ...c.env } }).status ?? 2;
    }
    const record: SuiteRunRecord = { schema: 'udgam-suite-run/1', report: c.report, command, exitCode, refused, reportSha256: sha256OrNull(c.file), git: { before, after: git() }, startedAt, finishedAt: new Date().toISOString() };
    writeFileSync(sidecarPath(c.file), `${JSON.stringify(record, null, 2)}\n`);
    runs.push({ report: c.report, file: c.file, command, exitCode });
  }
  return runs;
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
  (async () => {
    const a = parseSuiteArgs(process.argv.slice(2));
    const runs = await runSuite(a.suite, a.outDir, { evm: a.evm });
    for (const r of runs) console.log(`eval:${a.suite} — ${r.report}: exit ${r.exitCode}, report ${r.file}, run record ${sidecarPath(r.file)}`);
    process.exitCode = runs.some((r) => r.exitCode !== 0) ? 1 : 0;
  })().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  });
}

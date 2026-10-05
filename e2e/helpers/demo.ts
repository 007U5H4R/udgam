import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { SEED } from '../../scripts/seed/data';

// Helpers for the demo specs (TKT-20, playwright.demo.config.ts). The web server seeded the demo state
// into DEMO_DATA_DIR; the generated passwords are read from its seed-credentials.txt (the seed's own
// 0600 file, never printed). Everything else goes through the UI: no database access (EVAL-073).

export { SEED };

/** The demo server's DATA_DIR (playwright.demo.config.ts). */
export const DEMO_DATA_DIR = '.e2e-data/demo';

export type DemoRole = 'admin' | 'agent1' | 'agent2' | 'buyer';

/** A seeded account's email and generated password. */
export function account(key: DemoRole): { email: string; password: string } {
  const email = SEED.users.find((u) => u.key === key)!.email;
  const line = readFileSync(join(DEMO_DATA_DIR, 'seed-credentials.txt'), 'utf8')
    .split('\n')
    .find((l) => l.split('\t')[1] === email);
  if (!line) throw new Error(`no seeded credentials for ${key}`);
  return { email, password: line.split('\t')[2]! };
}

/** Sign in through the sign-in screen as a seeded account. */
export async function signInAs(page: Page, key: DemoRole): Promise<void> {
  const { email, password } = account(key);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/sign-in$/);
}

export type StepTiming = { step: string; startedAt: string; endedAt: string; ms: number };

/** Each demo step as a test.step, with its wall-clock start and end recorded (TC-078). */
export function stepTimer() {
  const steps: StepTiming[] = [];
  const t0 = Date.now();
  return {
    steps,
    async step<T>(name: string, body: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        return await test.step(name, body);
      } finally {
        const end = Date.now();
        steps.push({ step: name, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), ms: end - start });
      }
    },
    totalMs: () => Date.now() - t0,
  };
}

const gitSha = (): string => {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

/** Add this run's step timings to evals/results/local/demo-run-<sha>.json (git-ignored), keyed by spec and project. */
export function writeTimings(info: TestInfo, spec: string, steps: StepTiming[], totalMs: number): string {
  const dir = join('evals', 'results', 'local');
  mkdirSync(dir, { recursive: true });
  const sha = gitSha();
  const file = join(dir, `demo-run-${sha}.json`);
  const doc = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { runs: unknown[] }) : { sha, runs: [] as unknown[] };
  doc.runs.push({ spec, project: info.project.name, status: info.status ?? 'unknown', finishedAt: new Date().toISOString(), totalMs, steps });
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return file;
}

/** No horizontal page scroll at this width. */
export async function noHorizontalScroll(page: Page): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}

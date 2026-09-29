import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { EnrolmentSeed } from '../../scripts/seed-enrolment';
import { SEED_PASSWORD } from './auth';
import { E2E_DATA_DIR } from './tracer';

// e2e helpers for enrolment (TKT-05): a fresh FPO with its own admin and agent, and a code issued for
// the agent (optionally a phone enrolled and a plot registered), through scripts/seed-enrolment.ts
// against the e2e database; the file holding the code is deleted at once.

export function seedEnrolment(opts: { enrol?: boolean; plot?: boolean } = {}): EnrolmentSeed {
  const out = join(E2E_DATA_DIR, `enrolment-${randomUUID()}.json`);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent', SEED_PASSWORD };
  delete env.DATABASE_URL;
  const args = ['scripts/seed-enrolment.ts', '--out', out];
  if (opts.enrol) args.push('--enrol');
  if (opts.plot) args.push('--plot');
  execFileSync('./node_modules/.bin/tsx', args, { env, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    return JSON.parse(readFileSync(out, 'utf8')) as EnrolmentSeed;
  } finally {
    rmSync(out, { force: true });
  }
}

/**
 * Give this page its own client address. The enrol route limits attempts per X-Forwarded-For address
 * (10 per hour); parallel projects and re-runs on one e2e database would otherwise share one bucket.
 */
export async function ownClientAddress(page: Page): Promise<void> {
  const b = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${b()}.${b()}.${b()}` });
}

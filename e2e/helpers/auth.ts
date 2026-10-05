import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, DEV_SEED_PASSWORD } from '../../scripts/seed-accounts';
import { E2E_DATA_DIR } from './tracer';

// e2e sign-in helpers (TKT-04). The demo accounts are seeded into the e2e database (idempotent, safe
// to run from parallel workers). The password is SEED_PASSWORD, or the dev/test demo default.

export { DEMO_ACCOUNTS };
export const SEED_PASSWORD = process.env.SEED_PASSWORD || DEV_SEED_PASSWORD;

export function seedAccounts(): void {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent', SEED_PASSWORD };
  delete env.DATABASE_URL;
  execFileSync('./node_modules/.bin/tsx', ['scripts/seed-accounts.ts'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
}

/** Sign in through the sign-in screen and wait until the browser has left it. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  // By id, not by label: the screen speaks the `udgam_lang` language (DES-015), so a Kannada test signs in in Kannada.
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/sign-in$/);
}

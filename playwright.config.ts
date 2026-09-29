import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Chromium resolution (no `playwright install` in the cloud VM):
//   1. PW_CHROMIUM_PATH, if set;
//   2. /opt/pw-browsers/chromium (preinstalled in the claude.ai/code VM) when it exists and CI is unset;
//   3. otherwise Playwright's own download (CI runs `playwright install --with-deps chromium`).
const PRE_INSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'phone-small', use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Plain `next start` (not `pnpm start`): pnpm 12 runs scripts outside Playwright's process group, so the
    // server survives teardown, holds Playwright's stdio open and the run never exits.
    command: `pnpm build && ./node_modules/.bin/next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      DATA_DIR: '.e2e-data',
      REMOTE_SENSING_PROVIDER: 'fixture',
      // Enables the test-only surfaces (/__test__/*); they answer 404 without it (technical-plan §1).
      E2E: '1',
      // The production server requires an auth secret; a throwaway value generated per run, never committed.
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    },
  },
});

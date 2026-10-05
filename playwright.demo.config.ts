import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { DEMO_SPECS } from './e2e/helpers/spec-patterns';

// `pnpm demo` (technical-plan TSK-20.5, TC-078, EVAL-073/074): the automated Kodagu demo. The web server
// seeds a fresh demo state (`seed --reset` into .e2e-data/demo), builds and starts the app with
// DEMO_MODE=1 (the /admin/demo attack page) and E2E=1: the Playwright server is the only production-mode
// server allowed the fixture satellite provider (EXE12). Never set E2E or DEMO_MODE in a deployment.
//
// Two projects run the same story: the agent's phone is always 375 px; the office and the buyer use the
// project's width (375 px, then 1280 px). One worker: both projects share the seeded state and run in turn.

const PRE_INSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);

const PORT = Number(process.env.E2E_PORT ?? 3330);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('E2E_PORT must be a TCP port number');

/** Where the demo server keeps its data (git-ignored with .e2e-data/); the specs read the seed's files here. */
export const DEMO_DATA_DIR = '.e2e-data/demo';

export default defineConfig({
  testDir: './e2e',
  testMatch: DEMO_SPECS,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // The whole story must finish in under 10 minutes at each width (TC-078).
  timeout: 600_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'phone-375', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // Plain `next start`, not `pnpm start` (see playwright.config.ts): the server must die with the run.
    // `pnpm demo` needs no NODE_ENV: E2E=1 lets the seed run (EXE35's NODE_ENV=development is for
    // `pnpm seed`). The build and the server pin NODE_ENV=production, so a caller's NODE_ENV=development
    // cannot reach `next build`, which refuses a non-standard NODE_ENV (QA-P6-8-2).
    command: `./node_modules/.bin/tsx scripts/seed.ts --reset && NODE_ENV=production pnpm build && NODE_ENV=production ./node_modules/.bin/next start -p ${PORT}`,
    port: PORT,
    // Always a fresh seed: never reuse a server started from other data.
    reuseExistingServer: false,
    timeout: 420_000,
    env: {
      DATA_DIR: DEMO_DATA_DIR,
      REMOTE_SENSING_PROVIDER: 'fixture',
      E2E: '1',
      DEMO_MODE: '1',
      LOG_LEVEL: 'warn',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      // Tile hosts are stubbed in the specs; a placeholder, never sent anywhere. Not a real key.
      ARCGIS_API_KEY: 'e2e',
    },
  },
});

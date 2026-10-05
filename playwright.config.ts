import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { DEMO_SPECS } from './e2e/helpers/spec-patterns';

// Chromium resolution (no `playwright install` in the cloud VM):
//   1. PW_CHROMIUM_PATH, if set;
//   2. /opt/pw-browsers/chromium (preinstalled in the claude.ai/code VM) when it exists and CI is unset;
//   3. otherwise Playwright's own download (CI runs `playwright install --with-deps chromium`).
const PRE_INSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);

// E2E_PORT (default 3100) sets the web server's port and baseURL. With reuseExistingServer on
// (outside CI), a run whose port is already served reuses that server, even one started from
// another worktree with other code and another .e2e-data. Parallel worktrees and agents must
// therefore each pick their own port, for example `E2E_PORT=3101 pnpm test:e2e`.
const PORT = Number(process.env.E2E_PORT ?? 3100);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('E2E_PORT must be a TCP port number');

export default defineConfig({
  testDir: './e2e',
  // The demo specs (TKT-20) need the seeded demo server: they run with `pnpm demo` (playwright.demo.config.ts).
  testIgnore: DEMO_SPECS,
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
      // TC-045 (TSK-10.10): the fixture NDVI calls answer 2 s late, so the satellite groups visibly tick
      // after the local ones. Honoured only with E2E=1 (src/lib/capture/context.ts withE2eDelay).
      E2E_FIXTURE_DELAY_MS: '2000',
      // The production server requires an auth secret; a throwaway value generated per run, never committed.
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      // Better Auth checks request origins against its base URL: the server's own address on this port.
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // The admin plot editor requests keyed Esri tiles (TKT-06); e2e specs stub every tile host
      // (helpers/stubs.ts), so this placeholder is never sent anywhere. Not a real key.
      ARCGIS_API_KEY: 'e2e',
    },
  },
});

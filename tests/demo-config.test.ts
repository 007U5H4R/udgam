import { describe, expect, it } from 'vitest';
import demoConfig from '../playwright.demo.config';

// QA-P6-8-2: `NODE_ENV=development pnpm demo` failed in `next build` (Next refuses a non-standard NODE_ENV
// at build time). The demo needs no NODE_ENV: its server sets E2E=1, which passes the seed guard (EXE35;
// NODE_ENV=development is for `pnpm seed` only). So that the prefixed form also works, the web server pins
// NODE_ENV=production for the build and the server, and leaves the seed with the caller's environment.

const webServer = demoConfig.webServer;
const command = (Array.isArray(webServer) ? webServer[0] : webServer)?.command ?? '';
const steps = command.split('&&').map((s) => s.trim());

describe('pnpm demo web server (QA-P6-8-2)', () => {
  it('seeds, then builds and starts with NODE_ENV=production whatever the caller set', () => {
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/^\.\/node_modules\/\.bin\/tsx scripts\/seed\.ts --reset$/);
    expect(steps[1]).toBe('NODE_ENV=production pnpm build');
    expect(steps[2]).toMatch(/^NODE_ENV=production \.\/node_modules\/\.bin\/next start -p \d+$/);
  });

  it('runs the seed on the Playwright server path (E2E=1), so the seed needs no NODE_ENV either', () => {
    const env = (Array.isArray(webServer) ? webServer[0] : webServer)?.env ?? {};
    expect(env.E2E).toBe('1');
    expect(env.DEMO_MODE).toBe('1');
    expect('NODE_ENV' in env).toBe(false);
  });
});

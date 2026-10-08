import { describe, expect, it } from 'vitest';
import { DEMO_SPECS } from '../e2e/helpers/spec-patterns';

// TKT-20 spec review S1: Playwright matches testMatch/testIgnore against the ABSOLUTE path, so the demo
// spec pattern must look at the file name only. Otherwise a checkout under a path containing "demo"
// makes `pnpm test:e2e` ignore every spec and `pnpm demo` run the whole suite.

describe('DEMO_SPECS: the demo specs, by file name only (S1)', () => {
  it('matches the two demo specs, under any checkout path', () => {
    for (const root of ['/home/user/udgam', '/home/demo/udgam', '/srv/udgam-demo-checkout', 'C:\\demo\\udgam']) {
      const sep = root.includes('\\') ? '\\' : '/';
      expect(DEMO_SPECS.test([root, 'e2e', 'demo.spec.ts'].join(sep)), `${root} demo.spec.ts`).toBe(true);
      expect(DEMO_SPECS.test([root, 'e2e', 'demo-attacks.spec.ts'].join(sep)), `${root} demo-attacks.spec.ts`).toBe(true);
    }
  });

  it('does not match an ordinary spec under a path containing "demo"', () => {
    for (const path of ['/home/demo/udgam/e2e/tracer.spec.ts', '/srv/udgam-demo-checkout/e2e/admin-plots.spec.ts', 'C:\\demo\\udgam\\e2e\\smoke.spec.ts', '/home/user/udgam/e2e/demo/tracer.spec.ts']) {
      expect(DEMO_SPECS.test(path), path).toBe(false);
    }
  });

  it('is the pattern both Playwright configs use', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('playwright.config.ts', 'utf8')).toMatch(/testIgnore: DEMO_SPECS,/);
    expect(readFileSync('playwright.demo.config.ts', 'utf8')).toMatch(/testMatch: DEMO_SPECS,/);
  });
});

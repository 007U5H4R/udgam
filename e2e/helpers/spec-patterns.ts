// The demo specs (TKT-20): `e2e/demo*.spec.ts`, run only by `pnpm demo` (playwright.demo.config.ts) and
// ignored by `pnpm test:e2e` (playwright.config.ts). Playwright matches the ABSOLUTE path, so the pattern
// looks at the file name only: a checkout under a path containing "demo" must not change what runs.
export const DEMO_SPECS = /(^|[\\/])demo[^\\/]*\.spec\.ts$/;

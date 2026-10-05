// `pnpm seed [--reset]` (technical-plan TSK-20.2): the Kodagu demo state in DATA_DIR. See scripts/seed/run.ts
// and scripts/seed/README.md. Logs stay quiet unless LOG_LEVEL says otherwise: the seed prints only counts
// and the credentials file's path.
//
// Usage: NODE_ENV=development pnpm seed [--reset]   (refused unless NODE_ENV is explicitly development or
// test, or E2E=1 on the Playwright server; see seedAllowed in scripts/seed/run.ts)
process.env.LOG_LEVEL ||= 'silent';
const { main } = await import('./seed/run');
process.exitCode = await main(process.argv.slice(2));
export {};

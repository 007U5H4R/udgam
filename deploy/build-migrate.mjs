#!/usr/bin/env node
// Bundle the app's migration runner for the production image (TSK-27.1, EXE29).
//
// Usage: node deploy/build-migrate.mjs [outfile]   (default .next/standalone/migrate.mjs)
//
// The entrypoint runs `node migrate.mjs` before `node server.js`: the same code as `pnpm db:migrate`
// (src/lib/db/migrate.ts: every committed migration, then the yield reference), never drizzle-kit. The
// runtime image has no tsx or pnpm, so the runner and its pure-JS imports (drizzle-orm, zod, the schema)
// go into one file. @libsql/client (a native binary per platform) and pino stay imports: the standalone
// server already ships both, built for the image's own architecture.
//
// esbuild is not a direct dependency; it is tsx's, so it is loaded through tsx (same lockfile pin).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');

const outfile = process.argv[2] ?? '.next/standalone/migrate.mjs';

await build({
  entryPoints: ['src/lib/db/migrate.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@libsql/client', 'pino'],
  // CommonJS dependencies inside an ESM bundle still call require().
  banner: { js: "import { createRequire as __udgamRequire } from 'node:module'; const require = __udgamRequire(import.meta.url);" },
  logLevel: 'warning',
});

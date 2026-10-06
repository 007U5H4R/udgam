#!/usr/bin/env node
// Bundle the operator tools that run inside the production image (TSK-27.1, EXE29, SEC-001).
//
// Usage: node deploy/build-tools.mjs [outdir]   (default .next/standalone)
//
// The runtime image is Next's standalone server: no tsx, no pnpm, no scripts/. Each tool below is
// bundled into one self-contained .mjs next to server.js (/app in the image):
//   migrate.mjs                the entrypoint's migration runner (`pnpm db:migrate`, src/lib/db/migrate.ts;
//                              every committed migration, then the yield reference), never drizzle-kit;
//   accounts-create.mjs        `pnpm accounts:create` (SEC-001), Better Auth's own password hashing bundled in;
//   accounts-set-password.mjs  `pnpm accounts:set-password`.
// Their pure-JS imports (drizzle-orm, zod, better-auth/crypto, the schema) go into the file.
// @libsql/client (a native binary per platform) and pino stay imports: the standalone server already
// ships both, built for the image's own architecture.
//
// Nothing but source modules may go in. A data, key, env or secrets file among a bundle's inputs fails
// the build (the bundles sit in the image beside server.js, and deploy/check-standalone.mjs checks them
// as part of the server artifact). Prints one line per bundle: its name and input count, never contents.
//
// esbuild is not a direct dependency; it is tsx's, so it is loaded through tsx (same lockfile pin).
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Bundle name → its entry point. */
export const TOOLS = {
  'migrate.mjs': 'src/lib/db/migrate.ts',
  'accounts-create.mjs': 'scripts/accounts-create.ts',
  'accounts-set-password.mjs': 'scripts/accounts-set-password.ts',
};

const DATA_DIRS = new Set(['data', 'data-ci', '.e2e-data', '.secrets', 'keys']);

/** Why an esbuild input path may not be bundled, or null when it may. */
export function forbiddenInput(path) {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  if (parts.slice(0, -1).some((p) => DATA_DIRS.has(p))) return 'a data, key or secrets directory';
  if (name === '.env' || name.startsWith('.env.')) return 'an env file';
  if (/\.(key|jwk|pem|db|sqlite)$/i.test(name)) return 'a key or database file';
  return null;
}

/** Build every tool into `outDir`. Returns each bundle's input paths; throws on a forbidden input. */
export async function buildTools(outDir) {
  const require = createRequire(import.meta.url);
  const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
  const inputs = {};
  for (const [name, entry] of Object.entries(TOOLS)) {
    const r = await build({
      entryPoints: [entry],
      outfile: join(outDir, name),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      external: ['@libsql/client', 'pino'],
      // CommonJS dependencies inside an ESM bundle still call require().
      banner: { js: "import { createRequire as __udgamRequire } from 'node:module'; const require = __udgamRequire(import.meta.url);" },
      metafile: true,
      logLevel: 'warning',
    });
    inputs[name] = Object.keys(r.metafile.inputs);
    const bad = inputs[name].map((p) => [p, forbiddenInput(p)]).filter(([, why]) => why);
    if (bad.length > 0) throw new Error(`${name} would bundle ${bad.map(([p, why]) => `${p} (${why})`).join(', ')}`);
  }
  return inputs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outDir = process.argv[2] ?? '.next/standalone';
  try {
    const inputs = await buildTools(outDir);
    for (const [name, list] of Object.entries(inputs)) console.log(`build-tools: ${join(outDir, name)} (${list.length} inputs)`);
  } catch (err) {
    console.error(`build-tools: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

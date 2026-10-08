import { configCheckLine } from './check';

// /app/config-check.mjs (deploy/build-tools.mjs bundles this file; deploy/entrypoint.sh runs it). It
// checks unconditionally: there is no main-module guard that a renamed file or a symlinked directory
// could miss, so the check can never pass by not running. Exit 0 silently, or print the one
// `config.invalid: <names>` line on stderr and exit 1 (src/lib/config/check.ts). Never import it.

const line = configCheckLine(process.env);
if (line !== null) {
  process.stderr.write(`${line}\n`);
  process.exitCode = 1;
}

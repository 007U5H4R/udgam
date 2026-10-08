import { invalidEnvNames } from './env';

// The container's configuration check (EXE55, TKT-27/28). deploy/build-tools.mjs bundles its command,
// src/lib/config/check-cli.ts, as /app/config-check.mjs, and deploy/entrypoint.sh runs it before the
// migrations:
//
//   valid:    exit 0, no output;
//   invalid:  ONE line on stderr, `config.invalid: NAME, NAME`, then exit 1. Variable names only,
//             never a value, a rule or a message.
//
// So an invalid /etc/udgam/app.env stops the container at its start with a line that says which
// variables to fix (docs/ops/monitoring.md §1). The deploy gate fails at once on the restarting
// container and rolls back. A plain `next start` outside the container still stays up with /api/health
// answering 503 config:"error" (src/lib/config/boot.ts, EXE54).

/** The line to print for this environment, or null when it is valid. */
export function configCheckLine(src: Record<string, string | undefined>): string | null {
  const names = invalidEnvNames(src);
  return names.length === 0 ? null : `config.invalid: ${names.join(', ')}`;
}

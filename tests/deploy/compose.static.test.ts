import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static checks on deploy/docker-compose.yml (TKT-27): what must hold whatever app.env says.

const compose = readFileSync('deploy/docker-compose.yml', 'utf8');

/** The text of one top-level service block. */
function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start, `service ${name}`).toBeGreaterThan(0);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9_-]*:\n|\n[a-z]/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('deploy/docker-compose.yml', () => {
  it('pins the database and every key file to the volume, over app.env (Q15)', () => {
    const app = service('app');
    expect(app).toMatch(/^\s+DATABASE_URL: file:\/data\/udgam\.db$/m);
    expect(app).toMatch(/^\s+LEDGER_KEY_PATH: \/data\/keys\/ledger\.jwk$/m);
    expect(app).toMatch(/^\s+EVM_OPERATOR_KEY_PATH: \/data\/keys\/evm-operator\.key$/m);
    expect(app).toMatch(/^\s+DATA_DIR: \/data$/m);
  });

  it('publishes ports only from Caddy (EXE14, SEC-203)', () => {
    expect(service('app')).not.toMatch(/^\s+ports:/m);
    expect(service('anvil')).not.toMatch(/^\s+ports:/m);
    expect(service('caddy')).toMatch(/^\s+ports:/m);
  });
});

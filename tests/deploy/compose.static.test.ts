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

  it.each(['app', 'anvil'])('runs %s read-only, without capabilities or privilege escalation (Q12)', (name) => {
    const s = service(name);
    expect(s).toMatch(/^\s+read_only: true$/m);
    expect(s).toMatch(/^\s+cap_drop:\n\s+- ALL$/m);
    expect(s).toMatch(/^\s+security_opt:\n\s+- no-new-privileges:true$/m);
    expect(s).toMatch(/^\s+tmpfs:\n\s+- \/tmp:/m);
  });

  it("gives the app's Next cache a tmpfs owned by the app user", () => {
    expect(service('app')).toMatch(/^\s+- \/app\/\.next\/cache:uid=10001,gid=10001,mode=0700,size=\d+m$/m);
  });

  it('publishes ports only from Caddy (EXE14, SEC-203)', () => {
    expect(service('app')).not.toMatch(/^\s+ports:/m);
    expect(service('anvil')).not.toMatch(/^\s+ports:/m);
    expect(service('caddy')).toMatch(/^\s+ports:/m);
  });
});

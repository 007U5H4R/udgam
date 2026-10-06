import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sandbox, type Sandbox } from './helpers/script-sandbox';

// deploy/compose.sh reads UDGAM_DOMAIN and LEDGER_ADAPTER from app.env, one line each, the way a
// dotenv file writes them: quoted or not (fix round 1, S9). Run against the stub docker.

let sb: Sandbox;
beforeEach(() => {
  sb = sandbox();
});
afterEach(() => sb.cleanup());

const run = (envFile: string, extra: Record<string, string> = {}) => {
  writeFileSync(sb.env.UDGAM_ENV_FILE!, envFile);
  return sb.run('deploy/compose.sh', ['ps'], extra);
};

describe('deploy/compose.sh', () => {
  it.each([
    ['UDGAM_DOMAIN=udgamtrace.in\n'],
    ['UDGAM_DOMAIN="udgamtrace.in"\n'],
    ["UDGAM_DOMAIN='udgamtrace.in'\n"],
    ['UDGAM_DOMAIN=old.example\nUDGAM_DOMAIN="udgamtrace.in"\n'],
  ])('reads the domain from %j', (file) => {
    const r = run(file);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('domain=udgamtrace.in profiles= args=-f');
  });

  it('turns on the evm profile for LEDGER_ADAPTER="evm"', () => {
    expect(run('UDGAM_DOMAIN=d.example\nLEDGER_ADAPTER="evm"\n').stdout).toContain('profiles=evm');
    expect(run('UDGAM_DOMAIN=d.example\nLEDGER_ADAPTER=hashchain\n').stdout).toContain('profiles= ');
  });

  it('lets an exported UDGAM_DOMAIN win', () => {
    expect(run('UDGAM_DOMAIN=file.example\n', { UDGAM_DOMAIN: 'shell.example' }).stdout).toContain('domain=shell.example');
  });
});

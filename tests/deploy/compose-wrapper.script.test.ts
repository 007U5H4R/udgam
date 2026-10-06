import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('names a missing app.env plainly and runs no compose command', () => {
    const r = sb.run('deploy/compose.sh', ['ps'], { UDGAM_ENV_FILE: join(sb.root, 'missing.env') });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/missing\.env not found: create it from deploy\/app\.env\.example/);
    expect(sb.calls().some((c) => c.startsWith('docker'))).toBe(false);
  });

  it('names an app.env that is not a readable file', () => {
    const dir = join(sb.root, 'app.env.d');
    mkdirSync(dir);
    const r = sb.run('deploy/compose.sh', ['ps'], { UDGAM_ENV_FILE: dir });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('is not a readable file');
    expect(sb.calls().some((c) => c.startsWith('docker'))).toBe(false);
  });

  it('lets an exported UDGAM_DOMAIN win', () => {
    expect(run('UDGAM_DOMAIN=file.example\n', { UDGAM_DOMAIN: 'shell.example' }).stdout).toContain('domain=shell.example');
  });
});

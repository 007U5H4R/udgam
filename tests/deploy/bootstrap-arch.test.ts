import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STUBS } from './helpers/script-sandbox';

// deploy/bootstrap.sh formats volumes and rewrites the firewall, so it refuses any host but the Oracle
// A1's aarch64 unless UDGAM_ALLOW_NON_ARM=1 (the throwaway test container, tests/deploy/bootstrap/inner.sh
// sets it). The architecture check runs before the root check and before any change.
//
// NEVER run bootstrap.sh on this machine for real. Here it runs with stub `uname` and `id` first on PATH:
// the stub id reports a non-root user, so even a broken architecture check stops at "run as root",
// before step 1. The test refuses to start unless both stubs answer as intended.

const env = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', PATH: `${STUBS}:${process.env.PATH ?? ''}`, HOME: process.env.HOME ?? '/root', STUB_UID: '1000', ...extra });
const script = readFileSync('deploy/bootstrap.sh', 'utf8');
const safe = () => {
  expect(script.indexOf('UDGAM_ALLOW_NON_ARM'), 'bootstrap.sh has no architecture guard; refusing to run it').toBeGreaterThan(0);
  const id = spawnSync('id', ['-u'], { encoding: 'utf8', env: env({}) });
  expect(id.stdout.trim(), 'the stub id must report a non-root user before bootstrap.sh runs').toBe('1000');
};
const bootstrap = (extra: Record<string, string>) => {
  safe();
  return spawnSync('bash', ['deploy/bootstrap.sh'], { encoding: 'utf8', env: env(extra), timeout: 30_000 });
};

describe('bootstrap.sh on a non-aarch64 host', () => {
  it('refuses an x86_64 host before anything else, naming the escape hatch', () => {
    const r = bootstrap({ STUB_UNAME_M: 'x86_64' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('this host is x86_64, not aarch64');
    expect(r.stderr).not.toContain('run as root');
    expect(r.stdout).toBe('');
  });

  it('with UDGAM_ALLOW_NON_ARM=1 it warns and goes on (here to the root check, which the stub id fails)', () => {
    const r = bootstrap({ STUB_UNAME_M: 'x86_64', UDGAM_ALLOW_NON_ARM: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('warn: x86_64, not aarch64; continuing');
    expect(r.stderr).toContain('run as root');
  });

  it('an aarch64 host passes the architecture check', () => {
    const r = bootstrap({ STUB_UNAME_M: 'aarch64' });
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('aarch64');
    expect(r.stderr).toContain('run as root');
  });
});

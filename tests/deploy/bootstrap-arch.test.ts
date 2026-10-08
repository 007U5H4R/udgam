import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { STUBS } from './helpers/script-sandbox';

// deploy/bootstrap.sh formats volumes and rewrites the firewall, so it refuses any host but the Oracle
// A1's aarch64 unless UDGAM_ALLOW_NON_ARM=1 (the throwaway test container, tests/deploy/bootstrap/inner.sh
// sets it). The architecture check runs before the root check and before any change.
//
// NEVER run bootstrap.sh on this machine for real. Three barriers, each enough on its own:
//   1. it always runs with --dry-run (changes nothing even as root on an aarch64 host);
//   2. a stub `id` reports a non-root user, so it stops at "run as root" before step 1;
//   3. every command that could change the machine (apt-get, iptables, mount, mkfs, ...) is a stub
//      first on PATH that records the call and fails; the test asserts none was called.
// It refuses to start unless the guard is in the script and the stubs answer as intended.

const DESTRUCTIVE = ['apt-get', 'dpkg', 'iptables', 'iptables-restore', 'iptables-save', 'mount', 'umount', 'mkfs.ext4', 'blkid', 'losetup', 'systemctl', 'curl', 'gpg', 'install', 'chown', 'python3', 'docker'];
const trap = mkdtempSync(join(tmpdir(), 'bootstrap-trap-'));
const CALLS = join(trap, 'calls.log');
for (const cmd of DESTRUCTIVE) {
  writeFileSync(join(trap, cmd), `#!/bin/sh\necho "${cmd} $*" >>"${CALLS}"\nexit 97\n`);
  chmodSync(join(trap, cmd), 0o755);
}
afterEach(() => rmSync(CALLS, { force: true }));
afterAll(() => rmSync(trap, { recursive: true, force: true }));

const env = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', PATH: `${trap}:${STUBS}:${process.env.PATH ?? ''}`, HOME: process.env.HOME ?? '/root', STUB_UID: '1000', ...extra });
const script = readFileSync('deploy/bootstrap.sh', 'utf8');
const safe = () => {
  expect(script.indexOf('UDGAM_ALLOW_NON_ARM'), 'bootstrap.sh has no architecture guard; refusing to run it').toBeGreaterThan(0);
  expect(script.includes('--dry-run) DRY=1'), 'bootstrap.sh has no --dry-run; refusing to run it').toBe(true);
  const id = spawnSync('id', ['-u'], { encoding: 'utf8', env: env({}) });
  expect(id.stdout.trim(), 'the stub id must report a non-root user before bootstrap.sh runs').toBe('1000');
  const apt = spawnSync('apt-get', ['--version'], { encoding: 'utf8', env: env({}) });
  expect(apt.status, 'the trap apt-get must answer before bootstrap.sh runs').toBe(97);
  rmSync(CALLS, { force: true });
};
const bootstrap = (extra: Record<string, string>) => {
  safe();
  const r = spawnSync('bash', ['deploy/bootstrap.sh', '--dry-run'], { encoding: 'utf8', env: env(extra), timeout: 30_000 });
  expect(existsSync(CALLS) ? readFileSync(CALLS, 'utf8') : '', 'bootstrap.sh called a command that changes the machine').toBe('');
  return r;
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

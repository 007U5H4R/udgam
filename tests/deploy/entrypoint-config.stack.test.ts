import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

// EXE55 in the built image: an invalid configuration stops the container at its entrypoint, before the
// migrations, with one `config.invalid: <variable names>` line and no value. Under the production
// restart policy that is a restart loop, which scripts/deploy.sh's gate fails at once (`restarting`).
//
// It needs a built image, so plain `pnpm test` skips it. Run it with:
//   UDGAM_TEST_IMAGE=udgam-app:<tag> pnpm vitest run tests/deploy/entrypoint-config.stack.test.ts

const IMAGE = process.env.UDGAM_TEST_IMAGE;
const name = `udgam-entrypoint-test-${randomUUID().slice(0, 8)}`;
/** Made-up values, built at run time, that must never be printed. */
const fake = (n: string) => ['fake', 'entrypoint', 'value', n].join('-');
const INVALID = {
  NODE_ENV: 'production',
  REMOTE_SENSING_PROVIDER: 'live',
  GFW_API_KEY: fake('gfw'),
  CDSE_CLIENT_ID: fake('id'),
  CDSE_CLIENT_SECRET: fake('secret'),
  BETTER_AUTH_URL: `https://${fake('auth')}.example`,
  PUBLIC_BASE_URL: `http://${fake('public')}.example`, // not https: DES-219
};
const envArgs = Object.entries(INVALID).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
// As production runs it: read-only, no capabilities (deploy/docker-compose.yml).
const hardening = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp', '--tmpfs', '/data:uid=10001,gid=10001,mode=0700'];
const docker = (...args: string[]) => spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });

afterAll(() => {
  if (IMAGE) docker('rm', '-f', name);
});

describe.skipIf(!IMAGE)('the image with an invalid configuration (EXE55)', () => {
  it('exits non-zero at the entrypoint with one config.invalid line naming the variables, never a value', () => {
    const r = docker('run', '--rm', ...hardening, ...envArgs, IMAGE!);
    const out = `${r.stdout}${r.stderr}`;
    expect(r.status).toBe(1);
    expect(out.split('\n').filter((l) => l.includes('config.invalid'))).toEqual(['config.invalid: BETTER_AUTH_SECRET, PUBLIC_BASE_URL']);
    expect(out).not.toContain('fake-entrypoint-value');
    expect(out).not.toContain('entrypoint: migrating'); // stopped before the migrations
  });

  it('restarts in a loop under restart: unless-stopped, which the deploy gate sees as `restarting`', () => {
    expect(docker('run', '-d', '--name', name, '--restart', 'unless-stopped', ...hardening, ...envArgs, IMAGE!).status).toBe(0);
    let restarts = 0;
    for (let i = 0; i < 30 && restarts < 1; i++) {
      spawnSync('sleep', ['1']);
      restarts = Number(docker('inspect', '-f', '{{.RestartCount}}', name).stdout.trim());
    }
    expect(restarts).toBeGreaterThanOrEqual(1);
    const logs = docker('logs', name);
    expect(`${logs.stdout}${logs.stderr}`).not.toContain('fake-entrypoint-value');
  }, 60_000);
});

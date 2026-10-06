import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Fix round 1, Q13: deploy/bootstrap.sh trusts Docker's apt key file only when it holds exactly one
// primary key and that key is Docker's (fingerprint 9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88).
// A file with Docker's key plus another one is refused: apt would trust both.
// `bootstrap.sh --check-docker-key <file>` runs that check alone (no root, no changes).

const DOCKER_KEY = 'tests/deploy/fixtures/docker-apt-key.asc';
const hasGpg = spawnSync('gpg', ['--version']).status === 0;
let dir: string;
let otherKey: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'docker-key-'));
  if (!hasGpg) return;
  const env = { ...process.env, GNUPGHOME: dir };
  spawnSync('gpg', ['--batch', '--passphrase', '', '--quick-gen-key', 'Not Docker <x@example.invalid>', 'ed25519', 'sign', '1d'], { env });
  otherKey = spawnSync('gpg', ['--armor', '--export', 'x@example.invalid'], { env, encoding: 'utf8' }).stdout;
}, 60_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Never run bootstrap.sh unless it knows the check-only mode: an older script would start bootstrapping
// this machine (it ignored unknown arguments).
const knowsCheckMode = readFileSync('deploy/bootstrap.sh', 'utf8').includes('--check-docker-key) CHECK_KEY=');
const check = (file: string) => {
  expect(knowsCheckMode, 'bootstrap.sh has no --check-docker-key mode; refusing to run it').toBe(true);
  return spawnSync('bash', ['deploy/bootstrap.sh', '--check-docker-key', file], { encoding: 'utf8' });
};

describe.skipIf(!hasGpg)('bootstrap.sh --check-docker-key', () => {
  it("accepts Docker's own key file", () => {
    const r = check(DOCKER_KEY);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it("refuses Docker's key bundled with another primary key", () => {
    const f = join(dir, 'two.asc');
    writeFileSync(f, readFileSync(DOCKER_KEY, 'utf8') + otherKey);
    const r = check(f);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('2 primary keys');
  });

  it('refuses a key that is not Docker’s', () => {
    const f = join(dir, 'other.asc');
    writeFileSync(f, otherKey);
    const r = check(f);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('9DC858229FC7DD38854AE2D88D81803C0EBFCD88');
  });
});

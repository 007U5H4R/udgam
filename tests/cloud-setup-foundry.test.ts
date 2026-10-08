import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// TKT-22 spike follow-ups (TASK-23 quality review B-1, B-2, B-3, B-5, B-6): the Foundry block of
// scripts/cloud-setup.sh, run on its own with a fake HOME and a fake `curl` that records its arguments
// and fails (no network here). The pinned digests cannot be faked, so a successful install is covered by
// the CI setup-idempotent job; the parts testable offline are tested here.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(join(ROOT, 'scripts/cloud-setup.sh'), 'utf8');
const BLOCK = SCRIPT.slice(SCRIPT.indexOf('# Foundry: added by TKT-22'));
const linux = process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch);

let dir: string;
let home: string;
let fakeBin: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'udgam-foundry-setup-'));
  home = join(dir, 'home');
  fakeBin = join(dir, 'fakebin');
  mkdirSync(home);
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, 'curl'), '#!/usr/bin/env bash\nprintf "%s\\n" "$@" >> "$CURL_LOG"\nexit 7\n');
  chmodSync(join(fakeBin, 'curl'), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Puts a fake forge/anvil/cast in ~/.foundry/bin, each reporting `versions[name]`. */
function fakeFoundry(versions: Record<'forge' | 'anvil' | 'cast', string>) {
  const bin = join(home, '.foundry', 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, v] of Object.entries(versions)) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "${name} Version: ${v}"\necho "Commit SHA: 0"\n`);
    chmodSync(join(bin, name), 0o755);
  }
}

/** Runs the Foundry block with an earlier EXIT trap that writes a marker file. */
function runBlock(env: Record<string, string> = {}) {
  const harness = `set -euo pipefail
ok()  { echo "ok: $1 already satisfied"; }
did() { echo "did: $1"; }
trap 'echo prior-trap-ran > "$MARK"' EXIT
${BLOCK}`;
  const r = spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: `${fakeBin}:${process.env.PATH ?? ''}`, HOME: home, CURL_LOG: join(dir, 'curl.log'), MARK: join(dir, 'mark'), TMPDIR: dir, ...env },
  });
  const curlLog = existsSync(join(dir, 'curl.log')) ? readFileSync(join(dir, 'curl.log'), 'utf8') : '';
  return { ...r, curlLog, mark: existsSync(join(dir, 'mark')) ? readFileSync(join(dir, 'mark'), 'utf8').trim() : null };
}

describe.runIf(linux)('cloud-setup.sh Foundry block (TASK-23 B-1…B-6)', () => {
  it('curl is bounded and retries every error: --connect-timeout 20 --max-time 300 --retry 3 --retry-all-errors (B-1)', () => {
    const r = runBlock();
    const args = r.curlLog.split('\n');
    for (const [flag, value] of [
      ['--connect-timeout', '20'],
      ['--max-time', '300'],
      ['--retry', '3'],
    ] as const) {
      expect(args[args.indexOf(flag) + 1], flag).toBe(value);
    }
    expect(args).toContain('--retry-all-errors');
  });

  it('a failed download only warns by default (M-001 work still sets up offline)', () => {
    const r = runBlock();
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('warn: foundry 1.8.3 not installed');
    expect(r.stdout).not.toMatch(/^did:/m);
  });

  it('CLOUD_SETUP_STRICT=1 makes a failed download fatal (B-1)', () => {
    const r = runBlock({ CLOUD_SETUP_STRICT: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('error: download failed');
  });

  it('a failed solc download leaves no empty ~/.svm/0.8.37 directory (B-5)', () => {
    runBlock();
    expect(existsSync(join(home, '.svm', '0.8.37'))).toBe(false);
  });

  it('the skip check needs forge, anvil and cast all at v1.8.3 (B-3)', () => {
    fakeFoundry({ forge: '1.8.3', anvil: '1.8.3', cast: '1.8.3' });
    const all = runBlock();
    expect(all.stdout).toContain('ok: foundry 1.8.3 already satisfied');

    fakeFoundry({ forge: '1.8.3', anvil: '1.8.3', cast: '1.7.0' });
    const stale = runBlock();
    expect(stale.stdout).not.toContain('ok: foundry 1.8.3');
    expect(stale.curlLog).toContain('foundry_v1.8.3_linux_');
  });

  it('restores the earlier EXIT trap after its cleanup, and leaves no temp directory behind (B-6)', () => {
    const r = runBlock();
    expect(r.mark).toBe('prior-trap-ran');
    expect(readdirSync(dir).filter((f) => f.startsWith('tmp.'))).toEqual([]);
  });

  it('extracts with --no-same-owner (B-2)', () => {
    expect(BLOCK).toMatch(/tar --no-same-owner -xzf "\$tarball"/);
  });
});

describe('the CI setup-idempotent job runs the script strictly (B-1)', () => {
  it('sets CLOUD_SETUP_STRICT=1 in the job env; the job name is unchanged', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const start = ci.indexOf('  setup-idempotent:');
    const next = ci.slice(start + 1).search(/\n {2}[a-z-]+:\n/); // the next job
    const job = next < 0 ? ci.slice(start) : ci.slice(start, start + 1 + next);
    expect(job).toContain('name: setup-idempotent (TC-002)');
    expect(job.slice(0, job.indexOf('steps:'))).toMatch(/env:\n\s+CLOUD_SETUP_STRICT: '1'/);
  });
});

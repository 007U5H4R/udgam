import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sandbox, type Sandbox } from './helpers/script-sandbox';

// scripts/deploy.sh against stub docker and compose and a throwaway git repository (TKT-27 fix round 1).
//   Q2   `compose up` failing fails the gate (its stderr is kept); health counts only when the running
//        container is udgam-app:current's image; Q16: a crash loop (restarting) fails at once.
//   Q4   last-predeploy moves to the new snapshot only once the new image is :current.
//   Q5   --rollback refuses when :current and :previous are one image; an automatic rollback keeps the
//        older :previous.
//   Q6   --rollback --restore-db checks the recorded snapshot before swapping any tag.
//   S4   a branch name deploys origin/<branch> after the fetch; a dirty checkout is refused even without
//        a ref.

const SCRIPT = 'scripts/deploy.sh';
const OLD = 'sha256:c0ffee';
const OLDER = 'sha256:0ld3r';
let sb: Sandbox;
let repo: string;
let origin: string;

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null' };
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const commit = (cwd: string, file: string, text: string) => {
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', text);
  return git(cwd, 'rev-parse', '--short', 'HEAD');
};

const deploy = (args: string[] = [], env: Record<string, string> = {}) =>
  sb.run(SCRIPT, args, { UDGAM_REPO: repo, UDGAM_HEALTH_TIMEOUT: '3', ...GIT_ENV, ...env });
const pointer = () => readFileSync(join(sb.data, 'backups', 'last-predeploy'), 'utf8').trim();

beforeEach(() => {
  sb = sandbox();
  origin = join(sb.root, 'origin.git');
  repo = join(sb.root, 'repo');
  mkdirSync(origin);
  git(origin, 'init', '-q', '--bare');
  git(sb.root, 'clone', '-q', origin, repo);
  commit(repo, 'app.txt', 'v1');
  git(repo, 'push', '-q', 'origin', 'HEAD:main');
  writeFileSync(join(sb.data, 'udgam.db'), 'live');
  sb.setTag('udgam-app:current', OLD);
  sb.setTag('udgam-app:previous', OLDER);
  sb.setContainer(`${OLD} running healthy`);
});
afterEach(() => sb.cleanup());

describe('deploy.sh deploy', () => {
  it('deploys: new image current, old image previous, healthy, pointer updated', () => {
    const sha = git(repo, 'rev-parse', '--short', 'HEAD');
    const r = deploy();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(sb.tag('udgam-app:current')).toBe(`sha256:built-${sha}`);
    expect(sb.tag('udgam-app:previous')).toBe(OLD);
    expect(sb.container()).toBe(`sha256:built-${sha} running healthy`);
    expect(pointer()).toMatch(/backups\/udgam-\d{8}T\d{6}Z-predeploy\.db$/);
    expect(r.stdout).toMatch(/end \(/);
  });

  it('Q2: a failing `compose up` fails the gate, keeps its stderr, and rolls back', () => {
    const r = deploy([], { STUB_UP_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('port is already allocated');
    expect(r.stdout).not.toMatch(/healthy \d+s after up/);
    expect(sb.tag('udgam-app:current')).toBe(OLD);
  });

  it('Q2: a container still on the old image does not pass the gate', () => {
    const r = deploy([], { STUB_UP_NOOP: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/not healthy within 3s; rolling back/);
    expect(sb.tag('udgam-app:current')).toBe(OLD);
  });

  it('Q16: a crash-looping container (restarting) fails at once, not at the timeout', () => {
    const t0 = Date.now();
    const r = deploy([], { STUB_RESTARTING: 'built-', UDGAM_HEALTH_TIMEOUT: '40' });
    expect(r.status).not.toBe(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(sb.container()).toBe(`${OLD} running healthy`);
  });

  it('Q5: an automatic rollback keeps the older :previous', () => {
    const r = deploy([], { STUB_UNHEALTHY: 'built-' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/rolled back to the previous image/);
    expect(sb.tag('udgam-app:current')).toBe(OLD);
    expect(sb.tag('udgam-app:previous')).toBe(OLDER);
  });

  it('Q4: the pointer is not moved when the new image never became :current', () => {
    mkdirSync(join(sb.data, 'backups'));
    writeFileSync(join(sb.data, 'backups', 'last-predeploy'), '/earlier/snapshot.db\n');
    const r = deploy([], { STUB_TAG_FAIL: 'udgam-app:current' });
    expect(r.status).not.toBe(0);
    expect(pointer()).toBe('/earlier/snapshot.db');
    expect(sb.tag('udgam-app:current')).toBe(OLD);
  });

  it('S4: a branch name deploys origin/<branch> after the fetch', () => {
    const other = join(sb.root, 'other');
    git(sb.root, 'clone', '-q', origin, other);
    const newer = commit(other, 'app.txt', 'v2');
    git(other, 'push', '-q', 'origin', 'HEAD:main');
    const r = deploy(['main']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(git(repo, 'rev-parse', '--short', 'HEAD')).toBe(newer);
    expect(sb.tag('udgam-app:current')).toBe(`sha256:built-${newer}`);
  });

  it('S4: a dirty checkout is refused even without a ref', () => {
    writeFileSync(join(repo, 'app.txt'), 'edited');
    const r = deploy();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('local changes');
    expect(sb.calls().some((c) => c.startsWith('docker build'))).toBe(false);
  });

  it('a failed build changes nothing', () => {
    const r = deploy([], { STUB_BUILD_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(sb.tag('udgam-app:current')).toBe(OLD);
    expect(sb.tag('udgam-app:previous')).toBe(OLDER);
    expect(sb.calls().some((c) => c.startsWith('compose up'))).toBe(false);
  });
});

describe('deploy.sh itself', () => {
  it('calls main and exits on ONE line: bash reads the file as it runs, and a checkout may rewrite it', () => {
    const lines = readFileSync(SCRIPT, 'utf8').trimEnd().split('\n');
    expect(lines.at(-1)).toBe('main "$@"; exit $?');
    expect(lines.filter((l) => /^main "/.test(l))).toHaveLength(1);
  });
});

describe('deploy.sh --rollback', () => {
  it('swaps :current and :previous and passes the gate on the swapped image', () => {
    sb.setContainer(`${OLD} running healthy`);
    const r = deploy(['--rollback']);
    expect(r.status).toBe(0);
    expect(sb.tag('udgam-app:current')).toBe(OLDER);
    expect(sb.tag('udgam-app:previous')).toBe(OLD);
    expect(sb.container()).toBe(`${OLDER} running healthy`);
  });

  it('Q2: fails when `compose up` fails', () => {
    const r = deploy(['--rollback'], { STUB_UP_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('port is already allocated');
  });

  it('Q5: refuses when :current and :previous are the same image', () => {
    sb.setTag('udgam-app:previous', OLD);
    const r = deploy(['--rollback']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('same image');
    expect(sb.calls().some((c) => c.startsWith('compose up'))).toBe(false);
  });

  it('--restore-db swaps the images, then restores the recorded snapshot through restore.sh', () => {
    mkdirSync(join(sb.data, 'backups'));
    const snap = join(sb.data, 'backups', 'udgam-20261001T000000Z-predeploy.db');
    writeFileSync(snap, 'before-the-deploy');
    writeFileSync(join(sb.data, 'backups', 'last-predeploy'), `${snap}\n`);
    const r = deploy(['--rollback', '--restore-db']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(readFileSync(join(sb.data, 'udgam.db'), 'utf8')).toBe('before-the-deploy');
    expect(sb.tag('udgam-app:current')).toBe(OLDER);
    expect(sb.container()).toBe(`${OLDER} running healthy`);
  });

  const recordSnapshot = () => {
    mkdirSync(join(sb.data, 'backups'));
    const snap = join(sb.data, 'backups', 'udgam-20261001T000000Z-predeploy.db');
    writeFileSync(snap, 'before-the-deploy');
    writeFileSync(join(sb.data, 'backups', 'last-predeploy'), `${snap}\n`);
  };

  const asides = () => readdirSync(sb.data).filter((n) => n.startsWith('pre-restore-'));

  it('--restore-db: an older image that is not healthy on the snapshot puts the LIVE files back, both tags back, and the running image up on them', () => {
    recordSnapshot();
    const r = deploy(['--rollback', '--restore-db'], { STUB_UNHEALTHY: '0ld3r' }); // the older image never gets healthy
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(sb.data, 'udgam.db'), 'utf8')).toBe('live'); // never the snapshot: no write since the deploy is lost
    expect(asides()).toEqual([]);
    expect(r.stderr).toContain('the restore failed and put the live files back');
    expect(r.stderr).toContain('rollback with --restore-db failed');
    expect(sb.tag('udgam-app:current')).toBe(OLD);
    expect(sb.tag('udgam-app:previous')).toBe(OLDER);
    expect(sb.container()).toBe(`${OLD} running healthy`);
  });

  it('--restore-db: when the live files cannot all be put back, the app is left STOPPED and the log says where they are', () => {
    recordSnapshot();
    const r = deploy(['--rollback', '--restore-db'], { STUB_UNHEALTHY: '0ld3r', STUB_MV_FAIL: '*/pre-restore-*/udgam.db' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/left stopped/);
    expect(r.stderr).toMatch(/pre-restore-\d{8}T\d{6}Z/);
    expect(sb.container()).toMatch(/ exited /);
    expect(readFileSync(join(sb.data, asides()[0]!, 'udgam.db'), 'utf8')).toBe('live'); // still safe aside
    expect(sb.calls().filter((c) => c.startsWith('compose up')).length).toBe(1); // only restore.sh's own start on the snapshot
  });

  it('--restore-db: a restore that fails before any file moves leaves the database and puts both tags back', () => {
    recordSnapshot();
    const r = deploy(['--rollback', '--restore-db'], { STUB_MV_FAIL: '*/stage/udgam.db' });
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(sb.data, 'udgam.db'), 'utf8')).toBe('live');
    expect(sb.tag('udgam-app:current')).toBe(OLD);
    expect(sb.tag('udgam-app:previous')).toBe(OLDER);
    expect(sb.container()).toBe(`${OLD} running healthy`);
  });

  it('Q6: --restore-db checks the recorded snapshot before swapping any tag', () => {
    const r = deploy(['--rollback', '--restore-db']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('pre-deploy snapshot');
    expect(sb.tag('udgam-app:current')).toBe(OLD);
    expect(sb.tag('udgam-app:previous')).toBe(OLDER);
  });
});

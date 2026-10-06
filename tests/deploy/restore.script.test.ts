import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupName, sandbox, type Sandbox } from './helpers/script-sandbox';

// deploy/cron/restore.sh against stub compose, docker, age and mv (TKT-27 fix round 1, Q3, Q14, S2).
//   Q3   everything is staged on the volume first; the swap (current files aside, staged files in) is a
//        short run of renames; if it fails midway, the files moved aside go back, the staged ones are
//        dropped, the app is started again and the script says what happened.
//   Q14  a fresh --data-dir is created 0700.
//   S2   attestations/, evm/ and anvil/ come back with the database and keys; media/ is merged.

const SCRIPT = 'deploy/cron/restore.sh';
const IMG = 'sha256:c0ffee';
let sb: Sandbox;

const read = (p: string) => readFileSync(join(sb.data, p), 'utf8');
const put = (root: string, p: string, text: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true });
  writeFileSync(join(root, p), text);
};

/** An archive as backup.sh writes it (the stub age passes bytes through). */
function archive(files: Record<string, string>): string {
  const src = join(sb.root, 'archive-src');
  for (const [p, text] of Object.entries(files)) put(src, p, text);
  const out = join(sb.root, 'backup.tar.gz.age');
  const r = spawnSync('tar', ['-C', src, '-czf', out, ...Object.keys(files).map((p) => p.split('/')[0]!)].filter((v, i, a) => a.indexOf(v) === i), { encoding: 'utf8' });
  expect(r.status).toBe(0);
  return out;
}

const snapDb = backupName(1, 'nightly', '.db');
const fullArchive = () =>
  archive({
    [`backups/${snapDb}`]: 'restored-db',
    'keys/ledger.jwk': 'restored-key',
    'attestations/b.pdf': 'restored-attestation',
    'evm/deployment.json': 'restored-evm',
    'media/new.jpg': 'restored-photo',
  });

beforeEach(() => {
  sb = sandbox();
  put(sb.data, 'udgam.db', 'live-db');
  put(sb.data, 'udgam.db-wal', 'live-wal');
  put(sb.data, 'keys/ledger.jwk', 'live-key');
  put(sb.data, 'attestations/a.pdf', 'live-attestation');
  put(sb.data, 'media/old.jpg', 'live-photo');
  sb.setTag('udgam-app:current', IMG);
  sb.setContainer(`${IMG} running healthy`);
  writeFileSync(join(sb.root, 'identity.txt'), 'AGE-SECRET-KEY-STUB');
});
afterEach(() => sb.cleanup());

const restore = (args: string[], env: Record<string, string> = {}) => sb.run(SCRIPT, [...args, '--health-timeout', '3'], env);
const asides = () => readdirSync(sb.data).filter((n) => n.startsWith('pre-restore-'));

describe('restore.sh', () => {
  it('restores an archive online: stop, swap, start, healthy; the old files kept aside', () => {
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt')]);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(read('udgam.db')).toBe('restored-db');
    expect(existsSync(join(sb.data, 'udgam.db-wal'))).toBe(false);
    expect(statSync(join(sb.data, 'udgam.db')).mode & 0o777).toBe(0o600);
    expect(read('keys/ledger.jwk')).toBe('restored-key');
    expect(read('attestations/b.pdf')).toBe('restored-attestation');
    expect(existsSync(join(sb.data, 'attestations/a.pdf'))).toBe(false);
    expect(read('evm/deployment.json')).toBe('restored-evm');
    expect(read('media/old.jpg')).toBe('live-photo'); // media is merged, never replaced
    expect(read('media/new.jpg')).toBe('restored-photo');
    const [aside] = asides();
    expect(readFileSync(join(sb.data, aside!, 'udgam.db'), 'utf8')).toBe('live-db');
    expect(readFileSync(join(sb.data, aside!, 'udgam.db-wal'), 'utf8')).toBe('live-wal');
    expect(readFileSync(join(sb.data, aside!, 'keys/ledger.jwk'), 'utf8')).toBe('live-key');
    expect(sb.calls().filter((c) => c.startsWith('compose stop') || c.startsWith('compose up'))).toEqual(['compose stop app', 'compose up -d app']);
    expect(readdirSync(sb.data).filter((n) => n.startsWith('.restore.'))).toEqual([]);
  });

  it('Q3: a swap that fails midway puts every previous file back and starts the app again', () => {
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt')], { STUB_MV_FAIL: '*/stage/keys' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/moved back/);
    expect(read('udgam.db')).toBe('live-db');
    expect(read('udgam.db-wal')).toBe('live-wal');
    expect(read('keys/ledger.jwk')).toBe('live-key');
    expect(read('attestations/a.pdf')).toBe('live-attestation');
    expect(asides()).toEqual([]);
    expect(readdirSync(sb.data).filter((n) => n.startsWith('.restore.'))).toEqual([]);
    const compose = sb.calls().filter((c) => c.startsWith('compose stop') || c.startsWith('compose up'));
    expect(compose).toEqual(['compose stop app', 'compose up -d app']);
  });

  it('refuses an archive without exactly one snapshot or without the ledger key, before stopping the app', () => {
    const two = archive({ [`backups/${snapDb}`]: 'a', [`backups/${backupName(2, 'nightly', '.db')}`]: 'b', 'keys/ledger.jwk': 'k' });
    expect(restore(['--archive', two, '--identity', join(sb.root, 'identity.txt')]).status).not.toBe(0);
    const nokey = archive({ [`backups/${snapDb}`]: 'a', 'keys/other.key': 'k' });
    expect(restore(['--archive', nokey, '--identity', join(sb.root, 'identity.txt')]).status).not.toBe(0);
    expect(sb.calls().some((c) => c.startsWith('compose stop'))).toBe(false);
    expect(read('udgam.db')).toBe('live-db');
  });

  it('restores a plain snapshot: the database only, keys untouched', () => {
    put(sb.root, 'snap.db', 'snapshot-db');
    const r = restore(['--snapshot', join(sb.root, 'snap.db')]);
    expect(r.status).toBe(0);
    expect(read('udgam.db')).toBe('snapshot-db');
    expect(read('keys/ledger.jwk')).toBe('live-key');
    expect(read('attestations/a.pdf')).toBe('live-attestation');
  });

  it('Q14: --offline into a fresh directory creates it 0700 and never touches the app', () => {
    const fresh = join(sb.root, 'fresh', 'drill');
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt'), '--data-dir', fresh, '--offline']);
    expect(r.status).toBe(0);
    expect(statSync(fresh).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(fresh, 'udgam.db'), 'utf8')).toBe('restored-db');
    expect(readFileSync(join(fresh, 'keys/ledger.jwk'), 'utf8')).toBe('restored-key');
    expect(sb.calls().some((c) => c.startsWith('compose'))).toBe(false);
  });

  it('--undo-if-unhealthy (deploy.sh --rollback --restore-db): an app not healthy on the restored files gets the live files back, and exits 1', () => {
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt'), '--undo-if-unhealthy'], { STUB_UNHEALTHY: 'c0ffee' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/moved back/);
    expect(read('udgam.db')).toBe('live-db');
    expect(read('udgam.db-wal')).toBe('live-wal');
    expect(read('keys/ledger.jwk')).toBe('live-key');
    expect(read('attestations/a.pdf')).toBe('live-attestation');
    expect(asides()).toEqual([]);
    const compose = sb.calls().filter((c) => c.startsWith('compose stop') || c.startsWith('compose up'));
    expect(compose).toEqual(['compose stop app', 'compose up -d app', 'compose stop app', 'compose up -d app']);
  });

  it('--undo-if-unhealthy: the restored database\'s own -wal/-shm (written once the app ran on it) never shadow the live ones', () => {
    // The stub app "runs" on the restored database: compose up leaves a -wal there.
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt'), '--undo-if-unhealthy'], { STUB_UNHEALTHY: 'c0ffee', STUB_UP_WRITES_WAL: join(sb.data, 'udgam.db-wal') });
    expect(r.status).toBe(1);
    expect(read('udgam.db-wal')).toBe('live-wal');
  });

  it('--undo-if-unhealthy: a live file that cannot be moved back exits 3 (a mixed data directory), naming the aside folder', () => {
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt'), '--undo-if-unhealthy'], { STUB_UNHEALTHY: 'c0ffee', STUB_MV_FAIL: '*/pre-restore-*/keys' });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/pre-restore-\d{8}T\d{6}Z/);
    expect(read('udgam.db')).toBe('live-db');
    expect(sb.container()).toMatch(/ exited /); // not started on a mixed directory
  });

  it('fails, naming where the previous files are, when the app is not healthy after the restore', () => {
    const r = restore(['--archive', fullArchive(), '--identity', join(sb.root, 'identity.txt')], { STUB_UNHEALTHY: 'c0ffee' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/pre-restore-\d{8}T\d{6}Z/);
  });
});

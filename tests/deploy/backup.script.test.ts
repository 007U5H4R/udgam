import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupName, sandbox, type Sandbox } from './helpers/script-sandbox';

// deploy/cron/backup.sh against stub docker, oci and age (TKT-27 fix round 1: Q1, Q7, Q8, S2).
//   Q1  RETENTION_DAYS must be a whole number >= 1; only this script's own objects (OCI_PREFIX +
//       udgam-<stamp>-*.tar.gz.age) are ever pruned; the object just uploaded and the newest 3 are kept.
//   Q7  a failed list or delete fails the run; nothing is counted that did not happen.
//   Q8  no .partial archive survives a failure; tar's "file changed" (exit 1) is accepted only for the
//       live directories (media/, anvil/).
//   S2  attestations/ and evm/ are always archived; anvil/ when LEDGER_ADAPTER=evm.

const SCRIPT = 'deploy/cron/backup.sh';
let sb: Sandbox;

const bucket = () => readdirSync(join(sb.state, 'bucket')).map((f) => f.replace(/%/g, '/')).sort();
const putObject = (name: string) => {
  mkdirSync(join(sb.state, 'bucket'), { recursive: true });
  writeFileSync(join(sb.state, 'bucket', name.replace(/\//g, '%')), 'old');
};
const backup = (env: Record<string, string> = {}) => sb.run(SCRIPT, [], { AGE_RECIPIENT: 'age1stubrecipient', OCI_BUCKET: 'udgam-backups', ...env });
const archiveListing = () => {
  const [obj] = bucket().filter((n) => n.includes(new Date().toISOString().slice(0, 10).replace(/-/g, '')));
  return spawnSync('tar', ['-tzf', join(sb.state, 'bucket', obj!.replace(/\//g, '%'))], { encoding: 'utf8' }).stdout;
};

beforeEach(() => {
  sb = sandbox();
  writeFileSync(join(sb.data, 'keys', 'ledger.jwk'), '{}');
});
afterEach(() => sb.cleanup());

describe('backup.sh retention (Q1)', () => {
  it('treats OCI_PREFIX as literal text: a prefix with regex metacharacters still prunes its own old objects', () => {
    const prefix = 'bk+1(x)[y]/';
    const old = [backupName(20), backupName(30)].map((n) => `${prefix}${n}`);
    const recent = [backupName(1), backupName(2)].map((n) => `${prefix}${n}`);
    for (const n of [...old, ...recent]) putObject(n);
    const r = backup({ RETENTION_DAYS: '14', OCI_PREFIX: prefix });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const left = bucket();
    for (const n of old) expect(left).not.toContain(n);
    for (const n of recent) expect(left).toContain(n);
    expect(left.filter((n) => n.startsWith(prefix))).toHaveLength(3);
  });

  it.each([['0'], ['abc'], ['-3'], ['14d'], ['1.5']])('refuses RETENTION_DAYS=%s before doing anything', (days) => {
    const r = backup({ RETENTION_DAYS: days });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('RETENTION_DAYS');
    expect(sb.calls().filter((c) => c.startsWith('docker run') || c.startsWith('oci'))).toEqual([]);
  });

  it('prunes only its own old objects, keeping the newest 3 and the one just uploaded', () => {
    const old = [backupName(20), backupName(30), backupName(40, 'predeploy')].map((n) => `backups/${n}`);
    const recent = [backupName(1), backupName(2)].map((n) => `backups/${n}`);
    const foreign = [
      'backups/notes.txt',
      `backups/${backupName(50)}.bak`,
      `backups/${backupName(50, 'nightly', '.db')}`,
      'backups/udgam-latest.tar.gz.age',
      `other/${backupName(60)}`,
    ];
    for (const n of [...old, ...recent, ...foreign]) putObject(n);
    const r = backup({ RETENTION_DAYS: '14' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const left = bucket();
    for (const n of old) expect(left).not.toContain(n);
    for (const n of [...recent, ...foreign]) expect(left).toContain(n);
    expect(left.filter((n) => /^backups\/udgam-\d{8}T\d{6}Z-[a-z]+\.tar\.gz\.age$/.test(n))).toHaveLength(3);
    expect(r.stdout).toMatch(/removed \d+ local, 3 remote/);
  });

  it('keeps the newest 3 even when every one of them is past the retention window', () => {
    for (const d of [30, 40, 50]) putObject(`backups/${backupName(d)}`);
    const r = backup({ RETENTION_DAYS: '1' });
    expect(r.status).toBe(0);
    const ours = bucket().filter((n) => n.startsWith('backups/udgam-'));
    expect(ours).toHaveLength(3); // today's + the two newest old ones; the 50-day one goes
    expect(ours).not.toContain(`backups/${backupName(50)}`);
  });

  it('applies the same rules locally and never removes the recorded pre-deploy snapshot', () => {
    const b = join(sb.data, 'backups');
    mkdirSync(b, { recursive: true });
    const predeploy = backupName(40, 'predeploy', '.db');
    for (const n of [backupName(20), backupName(30), backupName(20, 'nightly', '.db'), backupName(30, 'nightly', '.db'), predeploy, 'notes.txt'])
      writeFileSync(join(b, n), 'x');
    writeFileSync(join(b, 'last-predeploy'), `${join(b, predeploy)}\n`);
    const r = backup({ RETENTION_DAYS: '14' });
    expect(r.status).toBe(0);
    const left = readdirSync(b);
    expect(left).toContain(predeploy);
    expect(left).toContain('notes.txt');
    expect(left).toContain('last-predeploy');
    // 2 old archives + today's = 3 kept; snapshots: today's + 2 old + the protected one, none past the newest 3 except the protected
    expect(left.filter((n) => n.endsWith('.tar.gz.age'))).toHaveLength(3);
  });
});

describe('backup.sh failures propagate (Q7)', () => {
  it('fails when listing the bucket fails', () => {
    const r = backup({ STUB_OCI_LIST_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/backup: done/);
  });

  it('fails when a delete fails, without counting it', () => {
    const victim = `backups/${backupName(40)}`;
    for (const d of [1, 2, 3]) putObject(`backups/${backupName(d)}`);
    putObject(victim);
    const r = backup({ STUB_OCI_DELETE_FAIL: victim });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/remote/);
    expect(bucket()).toContain(victim);
  });

  it('fails when the upload fails', () => {
    const r = backup({ STUB_OCI_PUT_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/uploaded/);
  });
});

describe('backup.sh partial archives and live directories (Q8)', () => {
  it('leaves no .partial archive when encryption fails', () => {
    const r = backup({ STUB_AGE_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(readdirSync(join(sb.data, 'backups')).filter((n) => n.includes('.partial'))).toEqual([]);
    expect(sb.calls().some((c) => c.startsWith('oci os object put'))).toBe(false);
  });

  it('accepts tar exit 1 (a file changed while read) only when a live directory is archived', () => {
    mkdirSync(join(sb.data, 'media'));
    writeFileSync(join(sb.data, 'media', 'p.jpg'), 'x');
    expect(backup({ STUB_TAR_EXIT: '1', BACKUP_MEDIA: '1' }).status).toBe(0);
    expect(backup({ STUB_TAR_EXIT: '2', BACKUP_MEDIA: '1' }).status).not.toBe(0);
    expect(backup({ STUB_TAR_EXIT: '1', BACKUP_MEDIA: '0' }).status).not.toBe(0);
    expect(readdirSync(join(sb.data, 'backups')).filter((n) => n.includes('.partial'))).toEqual([]);
  });
});

describe('backup.sh scope (S2)', () => {
  beforeEach(() => {
    for (const d of ['attestations', 'evm', 'anvil', 'media']) {
      mkdirSync(join(sb.data, d));
      writeFileSync(join(sb.data, d, 'f'), 'x');
    }
  });

  it('archives the snapshot, keys/, attestations/ and evm/; not anvil/ or media/ by default', () => {
    expect(backup().status).toBe(0);
    const list = archiveListing();
    for (const p of ['keys/ledger.jwk', 'attestations/f', 'evm/f']) expect(list).toContain(p);
    expect(list).toMatch(/backups\/udgam-\d{8}T\d{6}Z-nightly\.db/);
    expect(list).not.toContain('anvil/');
    expect(list).not.toContain('media/');
  });

  it('archives anvil/ when the app runs the EVM ledger, and media/ with BACKUP_MEDIA=1', () => {
    writeFileSync(sb.env.UDGAM_ENV_FILE!, 'LEDGER_ADAPTER="evm"\n');
    expect(backup({ BACKUP_MEDIA: '1' }).status).toBe(0);
    const list = archiveListing();
    expect(list).toContain('anvil/f');
    expect(list).toContain('media/f');
  });

  it('still needs keys/', () => {
    rmSync(join(sb.data, 'keys'), { recursive: true, force: true });
    const r = backup();
    expect(r.status).not.toBe(0);
    expect(existsSync(join(sb.data, 'backups'))).toBe(false);
  });
});

describe('the root check (deploy/lib.sh require_root)', () => {
  it('UDGAM_TEST_NONROOT=1 alone does not turn it off: only with the sandbox marker UDGAM_TEST_SANDBOX=1', () => {
    const asUser = { STUB_UID: '1000', AGE_RECIPIENT: 'age1stubrecipient', OCI_BUCKET: 'udgam-backups' };
    const refused = sb.run(SCRIPT, [], { ...asUser, UDGAM_TEST_SANDBOX: '' });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('run as root');
    expect(sb.calls().filter((c) => c.startsWith('docker run'))).toEqual([]);
    const sandboxed = sb.run(SCRIPT, [], asUser);
    expect(sandboxed.stderr).not.toContain('run as root');
    expect(sandboxed.status).toBe(0);
  });
});

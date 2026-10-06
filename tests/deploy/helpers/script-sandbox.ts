import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// A throwaway world for running the deploy shell scripts under test: stub `docker`, `oci`, `age`, `mv`
// and compose (tests/deploy/stubs) first on PATH, a data directory, an env file and a lock directory, all
// in one temp folder. No Docker, no OCI, no root needed.

export const STUBS = resolve('tests/deploy/stubs');
export const REPO = resolve('.');

export type Sandbox = {
  root: string;
  state: string;
  data: string;
  env: NodeJS.ProcessEnv;
  run(script: string, args?: string[], env?: Record<string, string>, cwd?: string): SpawnSyncReturns<string>;
  calls(): string[];
  setTag(tag: string, id: string): void;
  tag(tag: string): string | null;
  container(): string | null;
  setContainer(line: string): void;
  cleanup(): void;
};

export function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'deploy-script-'));
  const state = join(root, 'state');
  const data = join(root, 'data');
  mkdirSync(join(state, 'tags'), { recursive: true });
  mkdirSync(join(data, 'keys'), { recursive: true });
  writeFileSync(join(state, 'ids'), '');
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PATH: `${STUBS}:${process.env.PATH ?? ''}`,
    HOME: root,
    TMPDIR: root,
    STUB_STATE: state,
    UDGAM_DATA_DIR: data,
    UDGAM_ENV_FILE: join(root, 'app.env'),
    UDGAM_BACKUP_ENV: join(root, 'backup.env'),
    UDGAM_COMPOSE: join(STUBS, 'compose'),
    UDGAM_LOCK_DIR: root,
    UDGAM_TEST_NONROOT: '1',
  };
  const tagFile = (tag: string) => join(state, 'tags', tag.replace(/[/:]/g, '_'));
  return {
    root,
    state,
    data,
    env,
    run: (script, args = [], extra = {}, cwd = REPO) =>
      spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', env: Object.assign({}, env, extra), timeout: 60_000 }),
    calls: () => (existsSync(join(state, 'calls.log')) ? readFileSync(join(state, 'calls.log'), 'utf8').trim().split('\n') : []),
    setTag: (tag, id) => {
      writeFileSync(join(state, 'ids'), `${readFileSync(join(state, 'ids'), 'utf8')}${id}\n`);
      writeFileSync(tagFile(tag), `${id}\n`);
    },
    tag: (tag) => (existsSync(tagFile(tag)) ? readFileSync(tagFile(tag), 'utf8').trim() : null),
    container: () => (existsSync(join(state, 'container')) ? readFileSync(join(state, 'container'), 'utf8').trim() : null),
    setContainer: (line) => writeFileSync(join(state, 'container'), `${line}\n`),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** A backup name for `daysAgo` days back: udgam-<UTC stamp>-<label><ext>. */
export function backupName(daysAgo: number, label = 'nightly', ext = '.tar.gz.age'): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `udgam-${stamp}-${label}${ext}`;
}

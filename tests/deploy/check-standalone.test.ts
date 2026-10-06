import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// TSK-27.1 and QA-M002-3: deploy/check-standalone.mjs guards what `output: 'standalone'` copies into the
// production image. It fails when the standalone server holds anything beyond the server, its modules,
// the migrations and the traced fixtures (the "whole project traced" symptom: docs, plans, tests,
// contracts), any data, key or env file, or more bytes than the budget. The Dockerfile runs it after
// `next build`, so an image is never built from a bloated or key-carrying artifact.

const SCRIPT = 'deploy/check-standalone.mjs';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'standalone-check-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (file: string, bytes = 16) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), Buffer.alloc(bytes, 'x'));
};
const run = (...args: string[]) => spawnSync('node', [SCRIPT, root, ...args], { encoding: 'utf8' });

const healthy = () => {
  put('server.js');
  put('package.json');
  put('.next/server/app/page.js');
  put('node_modules/next/package.json');
  put('node_modules/@img/sharp-linux-arm64/lib/sharp.node');
  put('node_modules/some-pkg/test/fixture.pem'); // inside node_modules: a package's own fixture
  put('src/lib/db/migrations/0000_init.sql');
  put('evals/fixtures/plots/a.geojson');
};

describe('check-standalone.mjs', () => {
  it('passes a standalone server of modules, migrations and fixtures, and prints its size', () => {
    healthy();
    const r = run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/check-standalone: \d+ files, [\d.]+ MB, within the \d+ MB budget/);
  });

  it.each([['technical-plan.md'], ['docs/proof-feed.md'], ['contracts/src/BatchRegistry.sol'], ['tests/x.test.ts'], ['backlog/a.md'], ['e2e/a.spec.ts']])(
    'fails when the project leaks in (%s): the whole-project trace of QA-M002-3',
    (file) => {
      healthy();
      put(file);
      const r = run();
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(file.split('/')[0]);
    },
  );

  it.each([['data/udgam.db'], ['.e2e-data/keys/ledger.jwk'], ['.secrets/auth'], ['.env'], ['.env.production'], ['src/keys/ledger.jwk'], ['evals/fixtures/x.key'], ['src/certs/server.pem']])(
    'fails on a data, key or env file (%s), naming it',
    (file) => {
      healthy();
      put(file);
      const r = run();
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(file);
    },
  );

  it('fails above the size budget', () => {
    healthy();
    put('node_modules/big/blob.bin', 2 * 1024 * 1024);
    const r = run('--max-mb', '1');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/over the 1 MB budget/);
  });

  it('exits 2 when the directory or its server.js is missing', () => {
    expect(spawnSync('node', [SCRIPT, join(root, 'missing')], { encoding: 'utf8' }).status).toBe(2);
    expect(run().status).toBe(2);
  });
});

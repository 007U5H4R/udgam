import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Final branch review finding 1 (TASK-25): scripts/ci/check-trace.mjs fails when a server route's file
// trace (.next/**/*.nft.json, what `output: 'standalone'` copies into the artifact) lists a file under
// data/, .e2e-data/, .secrets/, a .env file, or any private-key-looking file (*.key, *.jwk, *.pem)
// outside node_modules. Trace entries are relative to the .nft.json file's own directory.

const SCRIPT = 'scripts/ci/check-trace.mjs';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'trace-check-'));
  mkdirSync(join(root, '.next/server/app/api/verify/[batchId]'), { recursive: true });
  mkdirSync(join(root, '.next/server/chunks'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const ROUTE_NFT = '.next/server/app/api/verify/[batchId]/route.js.nft.json';
// six levels up from the route's directory is the project root
const UP = '../../../../../../';

const trace = (file: string, files: string[]) => writeFileSync(join(root, file), JSON.stringify({ version: 1, files }));
const run = (next = join(root, '.next')) => spawnSync('node', [SCRIPT, next, root], { encoding: 'utf8' });

describe('check-trace.mjs', () => {
  it('passes a trace of source, migrations and node_modules', () => {
    trace(ROUTE_NFT, [`${UP}node_modules/next/package.json`, `${UP}src/lib/db/migrations/0000_init.sql`, '../../../../chunks/ssr/a.js', `${UP}.env.example`]);
    trace('.next/server/chunks/x.js.nft.json', ['../../../node_modules/pino/package.json', '../../../node_modules/some-pkg/test/fixture.pem']);
    const r = run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('check-trace: 2 trace files, no data, key or secret file traced');
  });

  it.each([
    ['data/keys/zz-probe.key'],
    ['data/udgam.db'],
    ['.e2e-data/keys/ledger.jwk'],
    ['.secrets/better-auth-secret'],
    ['.env'],
    ['.env.local'],
    ['var/keys/evm/ORG-1.key'],
    ['custom-data/keys/users/u1.jwk'],
    ['certs/server.pem'],
  ])('fails when a route traces %s, naming the file and the trace', (file) => {
    trace(ROUTE_NFT, [`${UP}src/app/page.tsx`, `${UP}${file}`]);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(file);
    expect(r.stdout).toContain('route.js.nft.json');
  });

  it('exits 2 when there is no build output or no trace file', () => {
    expect(run(join(root, 'missing')).status).toBe(2);
    expect(run().status).toBe(2); // .next exists but holds no .nft.json
  });
});

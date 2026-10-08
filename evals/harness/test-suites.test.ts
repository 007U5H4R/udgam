import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { portInUse, runSuite, sidecarPath, suiteCommands, type SuiteCommand, type SuiteRunRecord } from './test-suites';
import type { TreeState } from './tree-state';

// eval:integration / eval:e2e run records (TASK-22 fix round 1): every suite report gets a sidecar
// `<report>.run.json` with the commit and tree state before and after the run, the command, its exit
// code and the report's SHA-256, so the release can prove a report came from this commit.
// No test TITLE here names an EVAL ID (the release would count it as evidence).

const root = mkdtempSync(join(tmpdir(), 'udgam-suites-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let k = 0;

const TREE: TreeState = { commit: 'c'.repeat(40), shortSha: 'ccccccc', branch: 'build/stage7', dirty: false, changes: [], formalOutputs: [] };
const node = (file: string, script: string, port?: number): SuiteCommand => ({ report: 'integration', file, command: process.execPath, args: ['-e', script], env: {}, ...(port ? { port } : {}) });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('runSuite writes a run record beside each report', () => {
  it('records the commit before and after, the command, the exit code and the report hash', async () => {
    const dir = join(root, `r${++k}`);
    const file = join(dir, 'integration.json');
    const body = '{"success":true,"testResults":[]}';
    let calls = 0;
    const git = () => (++calls === 1 ? TREE : { ...TREE, dirty: true, changes: ['?? stray.txt'] });
    const [run] = await runSuite('integration', dir, { commands: [node(file, `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(body)}); process.exit(3)`)], git });
    expect(run).toMatchObject({ report: 'integration', file, exitCode: 3 });
    const rec = JSON.parse(readFileSync(sidecarPath(file), 'utf8')) as SuiteRunRecord;
    expect(rec).toMatchObject({ schema: 'udgam-suite-run/1', report: 'integration', exitCode: 3, refused: null, reportSha256: sha(body) });
    expect(rec.git.before).toEqual(TREE);
    expect(rec.git.after).toMatchObject({ dirty: true, changes: ['?? stray.txt'] });
    expect(rec.command).toContain('-e');
    expect(typeof rec.startedAt).toBe('string');
  });

  it('removes a stale report and record first: a run that writes nothing leaves no report, and its record says so', async () => {
    const dir = join(root, `r${++k}`);
    const file = join(dir, 'integration.json');
    await runSuite('integration', dir, { commands: [node(file, '0')], git: () => TREE });
    writeFileSync(file, '{"stale":true}');
    await runSuite('integration', dir, { commands: [node(file, 'process.exit(1)')], git: () => TREE });
    expect(existsSync(file)).toBe(false);
    expect(JSON.parse(readFileSync(sidecarPath(file), 'utf8'))).toMatchObject({ exitCode: 1, reportSha256: null });
  });

  it('refuses a Playwright run whose port is already served (it would reuse a server built from other code)', async () => {
    const dir = join(root, `r${++k}`);
    const file = join(dir, 'e2e.json');
    const marker = join(dir, 'ran');
    const [run] = await runSuite('e2e', dir, { commands: [{ ...node(file, `require('fs').writeFileSync(${JSON.stringify(marker)}, '')`, 3999), report: 'e2e' }], git: () => TREE, portInUse: async (p) => p === 3999 });
    expect(run!.exitCode).toBe(2);
    expect(existsSync(marker)).toBe(false);
    expect(JSON.parse(readFileSync(sidecarPath(file), 'utf8'))).toMatchObject({ exitCode: 2, refused: expect.stringMatching(/port 3999 is already in use/) });
  });
});

describe('suite commands name the Playwright port they will serve', () => {
  it('E2E_PORT, else each config default', () => {
    expect(suiteCommands('e2e', '/out', { env: {} }).map((c) => c.port)).toEqual([3100, 3330]);
    expect(suiteCommands('e2e', '/out', { env: { E2E_PORT: '3760' } }).map((c) => c.port)).toEqual([3760, 3760]);
    expect(suiteCommands('integration', '/out')[0]!.port).toBeUndefined();
    expect(sidecarPath('/out/e2e-demo.json')).toBe('/out/e2e-demo.run.json');
  });
});

// Re-review nit Q-7: Playwright's `localhost` may reach a server bound to ::1 only, so both loopbacks are probed.
describe('portInUse probes both loopback addresses', () => {
  const listen = (host: string) =>
    new Promise<Server | null>((done) => {
      const s = createServer();
      s.once('error', () => done(null)); // e.g. no IPv6 in this sandbox
      s.listen(0, host, () => done(s));
    });
  const close = (s: Server) => new Promise<void>((done) => s.close(() => done()));

  it.each([['127.0.0.1'], ['::1']])('a server bound only to %s is found; the port is free once it closes', async (host) => {
    const s = await listen(host);
    if (!s) return; // this host has no such loopback: nothing can bind there, nothing to find
    const port = (s.address() as AddressInfo).port;
    expect(await portInUse(port)).toBe(true);
    await close(s);
    expect(await portInUse(port)).toBe(false);
  });

  it.each([
    ['::1', true],
    ['127.0.0.1', true],
    ['neither', false],
  ])('row %#: an injected probe where only %s accepts gives %s, and both loopbacks are asked', async (open, inUse) => {
    const asked: string[] = [];
    const probe = async (host: string, port: number) => {
      asked.push(`${host} ${port}`);
      return host === open;
    };
    expect(await portInUse(3100, probe)).toBe(inUse);
    expect(asked.sort()).toEqual(['127.0.0.1 3100', '::1 3100']);
  });
});

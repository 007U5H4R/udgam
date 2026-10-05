import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SECRET_ENV_NAMES } from '../src/lib/config/secret-names';

// TSK-19.7 · TC-075 · EVAL-083: scripts/ci/check-bundle-secrets.sh fails, naming the variable and never
// printing the value, when a fake secret value from .env.ci.example is in the client bundle; and
// .env.ci.example has a clearly fake value for every secret name in .env.example.

const SCRIPT = 'scripts/ci/check-bundle-secrets.sh';
// The one list of secret names (log redaction imports it too); the script's bash copy must equal it.
const SECRET_NAMES: readonly string[] = SECRET_ENV_NAMES;

const parseEnv = (file: string) =>
  new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)] as const),
  );

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bundle-secrets-'));
  mkdirSync(join(dir, '.next/static/chunks'), { recursive: true });
  mkdirSync(join(dir, '.next/server/app'), { recursive: true });
  writeFileSync(join(dir, '.next/static/chunks/main.js'), 'console.log("no secrets here")');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (next = join(dir, '.next'), env = '.env.ci.example') => spawnSync('bash', [SCRIPT, env, next], { encoding: 'utf8' });

describe('.env.ci.example', () => {
  it('names every secret of .env.example, each with a distinct, clearly fake value', () => {
    const example = parseEnv('.env.example');
    for (const name of SECRET_NAMES) expect(example.has(name), name).toBe(true);
    const ci = parseEnv('.env.ci.example');
    const values = SECRET_NAMES.map((n) => ci.get(n) ?? '');
    for (const [i, v] of values.entries()) expect(v, SECRET_NAMES[i]).toMatch(/^ci-fake-[a-z-]+-0+$/);
    expect(new Set(values).size).toBe(SECRET_NAMES.length);
    expect(ci.get('BETTER_AUTH_SECRET')!.length).toBeGreaterThanOrEqual(32); // env.ts requires 32+
    // the script checks exactly these names: the shared list, which log.ts redacts
    const line = /^SECRET_NAMES=\((.*)\)$/m.exec(readFileSync(SCRIPT, 'utf8'));
    expect(line?.[1]?.split(' ')).toEqual([...SECRET_NAMES]);
  });
});

describe('check-bundle-secrets.sh', () => {
  it('passes a clean bundle', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('none of 7 secret values');
  });

  it('fails on a secret in a static chunk, naming the variable and not the value', () => {
    const value = parseEnv('.env.ci.example').get('ARCGIS_API_KEY')!;
    writeFileSync(join(dir, '.next/static/chunks/leak.js'), `const k=${JSON.stringify(value)};`);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('ARCGIS_API_KEY');
    expect(r.stdout + r.stderr).not.toContain(value);
  });

  it('fails on a secret in prerendered HTML', () => {
    const value = parseEnv('.env.ci.example').get('BETTER_AUTH_SECRET')!;
    mkdirSync(join(dir, '.next/server/app/x'), { recursive: true });
    writeFileSync(join(dir, '.next/server/app/x/page.html'), `<p>${value}</p>`);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('BETTER_AUTH_SECRET');
    expect(r.stdout + r.stderr).not.toContain(value);
  });

  it.each([
    ['.next/server/app/x.rsc', 'GFW_API_KEY'],
    ['.next/server/app/x/page.body', 'CDSE_CLIENT_SECRET'],
    ['.next/server/app/x.meta', 'MAPTILER_KEY'],
    ['.next/server/pages/y.rsc', 'CDSE_CLIENT_ID'],
    ['.next/server/app/deep/nested/z.html', 'BETTER_AUTH_SECRET'],
  ])('fails on a secret in a prerendered payload served to clients: %s (fix round 1)', (file, name) => {
    const value = parseEnv('.env.ci.example').get(name)!;
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), `0:{"p":${JSON.stringify(value)}}`);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(name);
    expect(r.stdout + r.stderr).not.toContain(value);
  });

  it('ignores server-only code (.next/server chunks are never sent to a browser)', () => {
    const value = parseEnv('.env.ci.example').get('GFW_API_KEY')!;
    mkdirSync(join(dir, '.next/server/chunks'), { recursive: true });
    writeFileSync(join(dir, '.next/server/chunks/route.js'), `const k=${JSON.stringify(value)};`);
    expect(run().status).toBe(0);
  });

  it('exits 2 without a build or an env file', () => {
    expect(run(join(dir, 'missing')).status).toBe(2);
    expect(run(undefined, join(dir, 'no.env')).status).toBe(2);
  });
});

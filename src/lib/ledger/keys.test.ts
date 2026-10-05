import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, jwkThumbprint, verify } from '../crypto';

// TC-064 (library half): the ledger key is generated once, 0600, outside the repo, never logged.

const lines: string[] = [];
const sink = new Writable({
  write(chunk: Buffer, _enc, cb) {
    lines.push(chunk.toString());
    cb();
  },
});
vi.mock('../log', async (orig) => {
  const real = await orig<typeof import('../log')>();
  return { ...real, log: real.createLogger('trace', sink) };
});

// A seam for the race tests: runs just before keys.ts links its temp file to the final path.
const race = vi.hoisted(() => ({ beforeLink: null as null | ((to: string) => Promise<void>) }));
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>();
  return {
    ...real,
    link: async (from: string, to: string) => {
      if (race.beforeLink) await race.beforeLink(to);
      return real.link(from, to);
    },
  };
});

const root = mkdtempSync(join(tmpdir(), 'udgam-keys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshPath = () => join(root, `k${++n}`, 'keys', 'ledger.jwk');

beforeEach(() => {
  lines.length = 0;
  race.beforeLink = null;
  vi.resetModules();
});

async function privateJwk(): Promise<JsonWebKey> {
  const { kty, crv, x, y, d } = await globalThis.crypto.subtle.exportKey('jwk', (await generateKeyPair(true)).privateKey);
  return { kty, crv, x, y, d };
}

async function keysModule() {
  return import('./keys');
}

describe('loadLedgerKey (TC-064)', () => {
  it('creates the key file with mode 0600 in a 0700 directory on first load', async () => {
    const path = freshPath();
    const { loadLedgerKey } = await keysModule();
    const key = await loadLedgerKey(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey;
    expect(onDisk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(typeof onDisk.d).toBe('string');
    expect(key.kid).toBe(await jwkThumbprint(onDisk));
    expect(key.publicJwk).toEqual({ kty: 'EC', crv: 'P-256', x: onDisk.x, y: onDisk.y });
  });

  it('reuses the same key on a second boot (same kid) and signs verifiably with it', async () => {
    const path = freshPath();
    const first = await (await keysModule()).loadLedgerKey(path);
    vi.resetModules(); // a new process: nothing cached
    const second = await (await keysModule()).loadLedgerKey(path);
    expect(second.kid).toBe(first.kid);
    const sig = await second.sign('{"v":1}');
    expect(await verify(first.publicJwk, '{"v":1}', sig)).toBe(true);
  });

  it('gives one key to concurrent first loads', async () => {
    const path = freshPath();
    const { loadLedgerKey } = await keysModule();
    const keys = await Promise.all([loadLedgerKey(path), loadLedgerKey(path), loadLedgerKey(path)]);
    expect(new Set(keys.map((k) => k.kid)).size).toBe(1);
  });

  it('never logs the private member "d"', async () => {
    const path = freshPath();
    const { loadLedgerKey } = await keysModule();
    await loadLedgerKey(path);
    vi.resetModules();
    await (await keysModule()).loadLedgerKey(path);
    expect(lines.length).toBeGreaterThan(0); // the generation line was captured
    const text = lines.join('');
    expect(text).not.toContain('"d":');
    expect(text).not.toContain((JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey).d);
  });

  it('refuses a key file that is not a P-256 private JWK', async () => {
    const path = freshPath();
    const { loadLedgerKey } = await keysModule();
    await loadLedgerKey(path);
    writeFileSync(path, JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }));
    vi.resetModules();
    await expect((await keysModule()).loadLedgerKey(path)).rejects.toThrow(/ledger key/);
  });

  it('creates the file atomically: a process that loses the race (EEXIST on link) uses the winner key (quality #3)', async () => {
    const path = freshPath();
    const winner = await privateJwk();
    // Another process links its complete key file in between our temp write and our link.
    race.beforeLink = async (to) => writeFileSync(to, JSON.stringify(winner), { mode: 0o600 });
    const key = await (await keysModule()).loadLedgerKey(path);
    expect(key.kid).toBe(await jwkThumbprint(winner));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(winner);
    expect(readdirSync(dirname(path))).toEqual(['ledger.jwk']); // our temp file is gone
    expect(lines.join('')).not.toContain('ledger.key_generated');
  });

  it('never exposes a partial file: the final path appears only once the key is fully written (quality #3)', async () => {
    const path = freshPath();
    let seenAtLink: string[] = [];
    race.beforeLink = async () => {
      seenAtLink = readdirSync(dirname(path));
    };
    const key = await (await keysModule()).loadLedgerKey(path);
    expect(seenAtLink).toHaveLength(1);
    expect(seenAtLink[0]).toMatch(/^ledger\.jwk\.\d+\.[0-9a-f]+\.tmp$/); // only the temp file exists before the link
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(key.kid).toBe(await jwkThumbprint(JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey));
    expect(readdirSync(dirname(path))).toEqual(['ledger.jwk']);
  });

  it('gives one key to concurrent first loads in separate processes (cross-process EEXIST path, quality #6b)', async () => {
    const path = freshPath();
    const script = join(root, 'load-key.mts');
    const keysTs = resolve(dirname(fileURLToPath(import.meta.url)), 'keys.ts');
    writeFileSync(script, `import { loadLedgerKey } from ${JSON.stringify(keysTs)};\nconsole.log((await loadLedgerKey(process.argv[2]!)).kid);\n`);
    const tsx = resolve(dirname(fileURLToPath(import.meta.url)), '../../../node_modules/.bin/tsx');
    const run = promisify(execFile);
    const outs = await Promise.all(Array.from({ length: 4 }, () => run(tsx, [script, path], { env: { ...process.env, LOG_LEVEL: 'silent' } })));
    const kids = outs.map((o) => o.stdout.trim());
    expect(new Set(kids).size).toBe(1);
    expect(kids[0]).toBe(await jwkThumbprint(JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(path))).toEqual(['ledger.jwk']);
  }, 60_000);

  it('tightens a looser key file and key directory to 0600 / 0700 on load, with a warning (nit)', async () => {
    const path = freshPath();
    const { loadLedgerKey } = await keysModule();
    const first = await loadLedgerKey(path);
    chmodSync(path, 0o644);
    chmodSync(dirname(path), 0o755);
    vi.resetModules();
    lines.length = 0;
    const again = await (await keysModule()).loadLedgerKey(path);
    expect(again.kid).toBe(first.kid);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    const text = lines.join('');
    expect(text).toContain('ledger.key_mode_tightened');
    expect(text).toContain('ledger.key_dir_mode_tightened');
    expect(text).not.toContain('"d":');
  });

  it('generating into an existing loose key directory leaves it 0700 (final branch review finding 3)', async () => {
    const path = freshPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
    chmodSync(dirname(path), 0o755);
    await (await keysModule()).loadLedgerKey(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
  });

  it('the default location under DATA_DIR is git-ignored', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', 'data/keys/ledger.jwk'])).not.toThrow();
  });
});

describe('publishedKeys (TC-064)', () => {
  it('publishes one public JWK with kid, use and alg, and no private member', async () => {
    const path = freshPath();
    const { loadLedgerKey, publishedKeys } = await keysModule();
    const key = await loadLedgerKey(path);
    const doc = await publishedKeys(path);
    expect(doc).toEqual({ keys: [{ ...key.publicJwk, kid: key.kid, use: 'sig', alg: 'ES256' }] });
    expect(JSON.stringify(doc)).not.toContain('"d"');
  });
});

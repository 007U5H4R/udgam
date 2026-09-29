import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { jwkThumbprint, verify } from '../crypto';

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

const root = mkdtempSync(join(tmpdir(), 'udgam-keys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshPath = () => join(root, `k${++n}`, 'keys', 'ledger.jwk');

beforeEach(() => {
  lines.length = 0;
  vi.resetModules();
});

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

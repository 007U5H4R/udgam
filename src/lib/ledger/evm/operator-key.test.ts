import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// TSK-24.3 edge cases (TASK-25 fix round 1, quality finding 10): the EVM operator key file mirrors the
// ledger key (keys.test.ts): generated once 0600 in a 0700 directory, an invalid file is refused (never
// overwritten), a loose mode is tightened, concurrent first calls agree on one key, readers never create
// it, and the key itself never reaches a log line (only the operator address does).

const lines: string[] = [];
const sink = new Writable({
  write(chunk: Buffer, _enc, cb) {
    lines.push(chunk.toString());
    cb();
  },
});
vi.mock('../../log', async (orig) => {
  const real = await orig<typeof import('../../log')>();
  return { ...real, log: real.createLogger('trace', sink) };
});

const { loadOrCreateOperatorKey, readOperatorKey, OperatorKeyInvalid } = await import('./operator-key');

const root = mkdtempSync(join(tmpdir(), 'udgam-opkey-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
let path: string;
beforeEach(() => {
  lines.length = 0;
  path = join(root, `case-${++n}`, 'keys', 'evm-operator.key');
});

const KEY_RE = /^0x[0-9a-f]{64}$/;

describe('loadOrCreateOperatorKey', () => {
  it('generates a key once: 0600 file in a 0700 directory, one 0x-hex line; logs the address, never the key', async () => {
    const key = await loadOrCreateOperatorKey(path);
    expect(key).toMatch(KEY_RE);
    expect(readFileSync(path, 'utf8')).toBe(`${key}\n`);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    expect(await loadOrCreateOperatorKey(path)).toBe(key);
    const logged = lines.join('');
    expect(logged).toContain(privateKeyToAccount(key).address);
    expect(logged).toContain('evm.operator_key_generated');
    expect(logged).not.toContain(key.slice(2));
    expect(readdirSync(dirname(path))).toEqual(['evm-operator.key']); // no temp file left behind
  });

  it('refuses an invalid key file and leaves it untouched', async () => {
    await loadOrCreateOperatorKey(path);
    for (const bad of ['not a key\n', '0x1234\n', `${'ab'.repeat(32)}\n`, `0x${'zz'.repeat(32)}\n`, '']) {
      writeFileSync(path, bad);
      await expect(loadOrCreateOperatorKey(path)).rejects.toBeInstanceOf(OperatorKeyInvalid);
      await expect(readOperatorKey(path)).rejects.toBeInstanceOf(OperatorKeyInvalid);
      expect(readFileSync(path, 'utf8')).toBe(bad);
    }
  });

  it('the error for an invalid file never includes the file content', async () => {
    await loadOrCreateOperatorKey(path);
    const secretish = `0x${'cd'.repeat(31)}`;
    writeFileSync(path, secretish);
    const err = await loadOrCreateOperatorKey(path).catch((e: unknown) => e);
    expect(String((err as Error).message)).not.toContain(secretish.slice(2));
  });

  it('reads an uppercase key and surrounding whitespace as the same lowercase key', async () => {
    const key = await loadOrCreateOperatorKey(path);
    writeFileSync(path, `  0x${key.slice(2).toUpperCase()}  \n`, { mode: 0o600 });
    expect(await loadOrCreateOperatorKey(path)).toBe(key);
  });

  it('tightens a loose mode to 0600 and says so', async () => {
    await loadOrCreateOperatorKey(path);
    chmodSync(path, 0o644);
    await loadOrCreateOperatorKey(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(lines.join('')).toContain('evm.operator_key_mode_tightened');
  });

  it('concurrent first calls agree on one key', async () => {
    const keys = await Promise.all(Array.from({ length: 8 }, () => loadOrCreateOperatorKey(path)));
    expect(new Set(keys).size).toBe(1);
    expect(readFileSync(path, 'utf8')).toBe(`${keys[0]}\n`);
    expect(readdirSync(dirname(path))).toEqual(['evm-operator.key']);
  });
});

describe('readOperatorKey', () => {
  it('never creates the key: a missing file rejects with ENOENT', async () => {
    await expect(readOperatorKey(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => statSync(path)).toThrow();
  });

  it('reads the key loadOrCreateOperatorKey wrote', async () => {
    const key = await loadOrCreateOperatorKey(path);
    expect(await readOperatorKey(path)).toBe(key);
  });
});

import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, jwkThumbprint, verify } from '../crypto';

// TSK-14.2 (TP15): server-held per-user signing keys. The server signs admin statements on behalf of
// the signed-in admin with a P-256 key it keeps at DATA_DIR/keys/users/<userId>.jwk (0600).

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

// A seam for the cross-process race: runs just before the module links its temp file into place.
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

const root = mkdtempSync(join(tmpdir(), 'udgam-user-keys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
let dataDir = '';

beforeEach(() => {
  lines.length = 0;
  race.beforeLink = null;
  dataDir = join(root, `d${++n}`);
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dataDir);
});

const keyFile = (userId: string) => join(dataDir, 'keys', 'users', `${userId}.jwk`);
const mod = () => import('./signing-keys');

describe('signAsUser (TP15)', () => {
  it('creates DATA_DIR/keys/users/<userId>.jwk with mode 0600 on first use; the signature verifies', async () => {
    const { signAsUser } = await mod();
    const out = await signAsUser('USR-ADMIN-1', '{"v":1}');
    const path = keyFile('USR-ADMIN-1');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as JsonWebKey;
    expect(onDisk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(out.publicJwk).toEqual({ kty: 'EC', crv: 'P-256', x: onDisk.x, y: onDisk.y });
    expect(Object.keys(out.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y']); // exactly the public members
    expect(out.kid).toBe(await jwkThumbprint(onDisk)); // RFC 7638
    expect(await verify(out.publicJwk, '{"v":1}', out.signature)).toBe(true);
    expect(await verify(out.publicJwk, '{"v":2}', out.signature)).toBe(false);
  });

  it('reuses the key on a later call and after a restart (same kid)', async () => {
    const first = await (await mod()).signAsUser('USR-ADMIN-1', 'a');
    const again = await (await mod()).signAsUser('USR-ADMIN-1', 'b');
    vi.resetModules(); // a new process: nothing cached
    const restarted = await (await mod()).signAsUser('USR-ADMIN-1', 'c');
    expect(again.kid).toBe(first.kid);
    expect(restarted.kid).toBe(first.kid);
    expect(await verify(first.publicJwk, 'c', restarted.signature)).toBe(true);
    expect(readdirSync(dirname(keyFile('USR-ADMIN-1')))).toEqual(['USR-ADMIN-1.jwk']);
  });

  it('gives two users different keys', async () => {
    const { signAsUser } = await mod();
    const a = await signAsUser('USR-ADMIN-1', 'm');
    const b = await signAsUser('USR-ADMIN-2', 'm');
    expect(a.kid).not.toBe(b.kid);
    expect(await verify(b.publicJwk, 'm', a.signature)).toBe(false);
  });

  it('gives one key to concurrent first calls', async () => {
    const { signAsUser } = await mod();
    const outs = await Promise.all(Array.from({ length: 5 }, (_, i) => signAsUser('USR-ADMIN-1', `m${i}`)));
    expect(new Set(outs.map((o) => o.kid)).size).toBe(1);
    expect(readdirSync(dirname(keyFile('USR-ADMIN-1')))).toEqual(['USR-ADMIN-1.jwk']);
  });

  it('a process that loses the creation race (wx/link EEXIST) re-reads and uses the winner key', async () => {
    const { kty, crv, x, y, d } = await globalThis.crypto.subtle.exportKey('jwk', (await generateKeyPair(true)).privateKey);
    const winner = { kty, crv, x, y, d };
    race.beforeLink = async (to) => writeFileSync(to, JSON.stringify(winner), { mode: 0o600 });
    const out = await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    expect(out.kid).toBe(await jwkThumbprint(winner));
    expect(await verify(winner, 'm', out.signature)).toBe(true);
    expect(readdirSync(dirname(keyFile('USR-ADMIN-1')))).toEqual(['USR-ADMIN-1.jwk']); // our temp file is gone
  });

  it('never logs the private member "d"', async () => {
    await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    vi.resetModules();
    await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    expect(lines.length).toBeGreaterThan(0); // the generation line was captured
    const text = lines.join('');
    expect(text).not.toContain('"d":');
    expect(text).not.toContain((JSON.parse(readFileSync(keyFile('USR-ADMIN-1'), 'utf8')) as JsonWebKey).d);
  });

  it('refuses a user id that is not a plain identifier (no path traversal)', async () => {
    const { signAsUser, getUserPublicKey } = await mod();
    for (const bad of ['', '../ledger', 'a/b', 'a\\b', '.', 'x'.repeat(200)]) {
      await expect(signAsUser(bad, 'm'), bad).rejects.toThrow(/user id/);
      await expect(getUserPublicKey(bad), bad).rejects.toThrow(/user id/);
    }
  });

  it('tightens a looser key file and directory to 0600 / 0700 on load, with a warning (fix round 1)', async () => {
    const first = await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    chmodSync(keyFile('USR-ADMIN-1'), 0o644);
    chmodSync(dirname(keyFile('USR-ADMIN-1')), 0o755);
    vi.resetModules();
    lines.length = 0;
    const again = await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    expect(again.kid).toBe(first.kid);
    expect(statSync(keyFile('USR-ADMIN-1')).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(keyFile('USR-ADMIN-1'))).mode & 0o777).toBe(0o700);
    const text = lines.join('');
    expect(text).toContain('auth.signing_key_mode_tightened');
    expect(text).toContain('auth.signing_key_dir_mode_tightened');
    expect(text).not.toContain('"d":');
  });

  it('refuses a key file that is not a P-256 private JWK', async () => {
    await (await mod()).signAsUser('USR-ADMIN-1', 'm');
    writeFileSync(keyFile('USR-ADMIN-1'), JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }));
    vi.resetModules();
    await expect((await mod()).signAsUser('USR-ADMIN-1', 'm')).rejects.toThrow(/signing key/);
  });
});

describe('getUserPublicKey', () => {
  it("returns the user's public key and kid (creating it on first use), never the private member", async () => {
    const { getUserPublicKey, signAsUser } = await mod();
    const pub = await getUserPublicKey('USR-ADMIN-1');
    expect(Object.keys(pub.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(pub.kid).toBe(await jwkThumbprint(pub.publicJwk));
    const signed = await signAsUser('USR-ADMIN-1', 'm');
    expect(signed.kid).toBe(pub.kid);
    expect(await verify(pub.publicJwk, 'm', signed.signature)).toBe(true);
  });
});

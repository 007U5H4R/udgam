import { randomBytes } from 'node:crypto';
import { chmod, link, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { log } from '../log';
import { generateKeyPair, jwkThumbprint, publicMembers, type PublicJwk } from './ecdsa';

// A server-held P-256 private key in a JWK file (technical-plan §8.2 ledger key, §10 TP15 user keys).
// SERVER-ONLY (node:fs): not exported from ./index, which stays isomorphic.
//
// Created on first use: a complete temp file (flag 'wx', 0600, fsync) is hard-linked into place in a
// 0700 directory. link() fails with EEXIST if the path exists, so exactly one process creates the key,
// the final path never holds a partial file, and the loser reads the winner's key. On load, a file
// looser than 0600 and a directory looser than 0700 (e.g. after a restore) are tightened with a
// warning. The private member never leaves this module: it is not logged and not returned.

export type P256KeyFile = {
  /** RFC 7638 thumbprint of `publicJwk`. */
  kid: string;
  /** Exactly { kty, crv, x, y }. */
  publicJwk: PublicJwk;
  /** Non-extractable signing key. */
  privateKey: CryptoKey;
};

export type KeyFileOptions = {
  /** Names the key in errors, e.g. "ledger key" → "ledger key file is not JSON". */
  label: string;
  /** Log event prefix, e.g. "ledger.key" → "ledger.key_generated", "ledger.key_mode_tightened". */
  logPrefix: string;
  /** Extra non-secret log fields (e.g. the user id). */
  logFields?: Record<string, string>;
};

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;

export const isNodeError = (err: unknown, code: string) => err instanceof Error && (err as NodeJS.ErrnoException).code === code;

async function fromPrivateJwk(jwk: JsonWebKey, label: string): Promise<P256KeyFile> {
  if (typeof jwk?.d !== 'string' || jwk.d.length === 0) throw new TypeError(`${label} file is not a P-256 private JWK`);
  let publicJwk: PublicJwk;
  try {
    publicJwk = publicMembers(jwk);
  } catch {
    throw new TypeError(`${label} file is not a P-256 private JWK`);
  }
  const { kty, crv, x, y, d } = jwk;
  const privateKey = await globalThis.crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, ALG, false, ['sign']);
  return { kid: await jwkThumbprint(publicJwk), publicJwk, privateKey };
}

async function readKey(path: string, label: string): Promise<P256KeyFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) throw err;
    throw new TypeError(`${label} file is not JSON`);
  }
  return fromPrivateJwk(parsed as JsonWebKey, label);
}

async function generate(path: string, o: KeyFileOptions): Promise<P256KeyFile> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const pair = await generateKeyPair(true);
  const { kty, crv, x, y, d } = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await open(tmp, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({ kty, crv, x, y, d }));
      await file.sync();
    } finally {
      await file.close();
    }
    await link(tmp, path);
  } catch (err) {
    // Another process won the race: its file is complete (it was linked after its fsync). Use it.
    if (isNodeError(err, 'EEXIST')) return readKey(path, o.label);
    throw err;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
  const key = await fromPrivateJwk({ kty, crv, x, y, d }, o.label);
  log.info({ ...o.logFields, kid: key.kid }, `${o.logPrefix}_generated`);
  return key;
}

const octal = (mode: number) => (mode & 0o777).toString(8);

/**
 * Tighten a key file looser than 0600 and its directory looser than 0700, with a warning. The directory
 * is left alone unless this process owns it and it is not a shared sticky directory such as /tmp. A
 * failure to tighten is logged, never fatal.
 */
async function tightenModes(path: string, o: KeyFileOptions): Promise<void> {
  try {
    const file = await stat(path);
    if (file.mode & 0o077) {
      await chmod(path, 0o600);
      log.warn({ ...o.logFields, from: octal(file.mode), to: '600' }, `${o.logPrefix}_mode_tightened`);
    }
    const dir = dirname(path);
    const d = await stat(dir);
    if (d.mode & 0o077 && !(d.mode & 0o1000) && typeof process.getuid === 'function' && d.uid === process.getuid()) {
      await chmod(dir, 0o700);
      log.warn({ ...o.logFields, from: octal(d.mode), to: '700' }, `${o.logPrefix}_dir_mode_tightened`);
    }
  } catch (err) {
    log.warn({ ...o.logFields, errClass: err instanceof Error ? err.constructor.name : 'unknown' }, `${o.logPrefix}_mode_unchecked`);
  }
}

/** Load the P-256 key at absolute `path`, generating it on the first call if the file does not exist. */
export async function loadOrCreateP256KeyFile(path: string, o: KeyFileOptions): Promise<P256KeyFile> {
  let key: P256KeyFile;
  try {
    key = await readKey(path, o.label);
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) return generate(path, o);
    throw err;
  }
  await tightenModes(path, o);
  return key;
}

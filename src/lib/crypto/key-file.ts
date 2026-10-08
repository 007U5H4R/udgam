import { randomBytes } from 'node:crypto';
import { chmod, link, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { log } from '../log';
import { generateKeyPair, jwkThumbprint, publicMembers, type PublicJwk } from './ecdsa';

// Server-held private key files: the one custody routine for the ledger key and user keys (P-256 JWK,
// technical-plan §8.2, §10 TP15), the EVM operator key (TSK-24.3) and the per-organisation EVM keys
// (TSK-25.5) (final branch review finding 3: three copies had drifted). SERVER-ONLY (node:fs): not
// exported from ./index, which stays isomorphic.
//
// Created on first use: a complete temp file (flag 'wx', 0600, fsync) is hard-linked into place in a
// 0700 directory. link() fails with EEXIST if the path exists, so exactly one process creates the key,
// the final path never holds a partial file, and the loser reads the winner's key. On load, and after
// creating a key in a directory that already existed, a file looser than 0600 and a directory looser
// than 0700 (e.g. after a restore) are tightened with a warning. Key material never leaves the caller's
// codec: it is not logged here.

/** How one kind of key file is read and made. */
export type KeyFileCodec<T> = {
  /** Read and validate the key at `path`. A missing file must reject with the ENOENT error unchanged. */
  read: (path: string) => Promise<T>;
  /** A new key: the exact file contents to write, and the key as `read` would return it. */
  create: () => Promise<{ contents: string; value: T }>;
  /** Public log fields for the `<logPrefix>_generated` line (a kid, an address), never key material. */
  generatedFields: (value: T) => Record<string, string>;
};

export type KeyFileLogOptions = {
  /** Log event prefix, e.g. "ledger.key" → "ledger.key_generated", "ledger.key_mode_tightened". */
  logPrefix: string;
  /** Extra non-secret log fields (e.g. the user or organisation id). */
  logFields?: Record<string, string>;
};

export type KeyFileOptions = KeyFileLogOptions & {
  /** Names the key in errors, e.g. "ledger key" → "ledger key file is not JSON". */
  label: string;
};

export type P256KeyFile = {
  /** RFC 7638 thumbprint of `publicJwk`. */
  kid: string;
  /** Exactly { kty, crv, x, y }. */
  publicJwk: PublicJwk;
  /** Non-extractable signing key. */
  privateKey: CryptoKey;
};

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;

export const isNodeError = (err: unknown, code: string) => err instanceof Error && (err as NodeJS.ErrnoException).code === code;

const octal = (mode: number) => (mode & 0o777).toString(8);

/**
 * Tighten a key file looser than 0600 and its directory looser than 0700, with a warning. The directory
 * is left alone unless this process owns it and it is not a shared sticky directory such as /tmp. A
 * failure to tighten is logged, never fatal.
 */
async function tightenModes(path: string, o: KeyFileLogOptions): Promise<void> {
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

async function generate<T>(path: string, codec: KeyFileCodec<T>, o: KeyFileLogOptions): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const { contents, value } = await codec.create();
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await open(tmp, 'wx', 0o600);
    try {
      await file.writeFile(contents);
      await file.sync();
    } finally {
      await file.close();
    }
    await link(tmp, path);
  } catch (err) {
    // Another process won the race: its file is complete (it was linked after its fsync). Use it.
    if (isNodeError(err, 'EEXIST')) return codec.read(path);
    throw err;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
  log.info({ ...o.logFields, ...codec.generatedFields(value) }, `${o.logPrefix}_generated`);
  // mkdir leaves an existing directory's mode as it was: a restored 0755 keys/ is tightened now.
  await tightenModes(path, o);
  return value;
}

/** Load the key at absolute `path`, creating it on the first call if the file does not exist. */
export async function loadOrCreateKeyFile<T>(path: string, codec: KeyFileCodec<T>, o: KeyFileLogOptions): Promise<T> {
  let key: T;
  try {
    key = await codec.read(path);
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) return generate(path, codec, o);
    throw err;
  }
  await tightenModes(path, o);
  return key;
}

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

const p256Codec = (label: string): KeyFileCodec<P256KeyFile> => ({
  async read(path) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      if (isNodeError(err, 'ENOENT')) throw err;
      throw new TypeError(`${label} file is not JSON`);
    }
    return fromPrivateJwk(parsed as JsonWebKey, label);
  },
  async create() {
    const pair = await generateKeyPair(true);
    const { kty, crv, x, y, d } = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
    return { contents: JSON.stringify({ kty, crv, x, y, d }), value: await fromPrivateJwk({ kty, crv, x, y, d }, label) };
  },
  generatedFields: (key) => ({ kid: key.kid }),
});

/** Load the P-256 key at absolute `path`, generating it on the first call if the file does not exist. */
export function loadOrCreateP256KeyFile(path: string, o: KeyFileOptions): Promise<P256KeyFile> {
  return loadOrCreateKeyFile(path, p256Codec(o.label), o);
}

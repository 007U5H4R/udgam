import { randomBytes } from 'node:crypto';
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from '../config/env';
import { generateKeyPair, jwkThumbprint, publicMembers, sign, type PublicJwk } from '../crypto';
import { log } from '../log';

// Server-held per-user signing keys (technical-plan §10, TP15). Server-only. Admin statements (custody
// transfers, overrides) are signed by the server on behalf of the signed-in admin with a P-256 key
// kept at DATA_DIR/keys/users/<userId>.jwk: it attests which account decided, not possession of a
// personal device key. Created on first use (0600 in a 0700 directory) by writing a complete temp file
// with flag 'wx' and hard-linking it into place, so exactly one process creates a user's key and the
// final path never holds a partial file; the loser of a race reads the winner's key. The private
// member never leaves this module: not logged, not returned.

export type UserPublicKey = {
  /** RFC 7638 thumbprint of `publicJwk`. */
  kid: string;
  /** Exactly { kty, crv, x, y } (docs/proof-feed.md §9.2). */
  publicJwk: PublicJwk;
};

export type UserSignature = UserPublicKey & {
  /** ECDSA P-256 / SHA-256 over the UTF-8 bytes of the message; P1363 r‖s, base64url. */
  signature: string;
};

type UserKey = UserPublicKey & { privateKey: CryptoKey };

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
/** A user id safe to use as a file name (Better Auth and seeded ids fit). */
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const loaded = new Map<string, Promise<UserKey>>();

const isNodeError = (err: unknown, code: string) => err instanceof Error && (err as NodeJS.ErrnoException).code === code;

function keyPath(userId: string): string {
  if (!USER_ID.test(userId)) throw new TypeError('signing key: invalid user id');
  return resolve(join(env.DATA_DIR, 'keys', 'users', `${userId}.jwk`));
}

async function fromPrivateJwk(jwk: JsonWebKey): Promise<UserKey> {
  let publicJwk: PublicJwk;
  try {
    if (typeof jwk?.d !== 'string' || jwk.d.length === 0) throw new TypeError();
    publicJwk = publicMembers(jwk);
  } catch {
    throw new TypeError('signing key file is not a P-256 private JWK');
  }
  const { kty, crv, x, y, d } = jwk;
  const privateKey = await globalThis.crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, ALG, false, ['sign']);
  return { kid: await jwkThumbprint(publicJwk), publicJwk, privateKey };
}

async function readKey(path: string): Promise<UserKey> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) throw err;
    throw new TypeError('signing key file is not JSON');
  }
  return fromPrivateJwk(parsed as JsonWebKey);
}

async function generate(path: string, userId: string): Promise<UserKey> {
  await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
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
    // Another process created this user's key first; its file is complete (linked after its fsync).
    if (isNodeError(err, 'EEXIST')) return readKey(path);
    throw err;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
  const key = await fromPrivateJwk({ kty, crv, x, y, d });
  log.info({ userId, kid: key.kid }, 'auth.signing_key_generated');
  return key;
}

function userKey(userId: string): Promise<UserKey> {
  let path: string;
  try {
    path = keyPath(userId);
  } catch (err) {
    return Promise.reject(err);
  }
  let p = loaded.get(path);
  if (!p) {
    p = readKey(path).catch((err: unknown) => {
      if (isNodeError(err, 'ENOENT')) return generate(path, userId);
      throw err;
    });
    loaded.set(path, p);
    p.catch(() => loaded.delete(path)); // a failed load is not cached
  }
  return p;
}

/** Sign `message` (a JCS string) with `userId`'s server-held key, creating the key on first use. */
export async function signAsUser(userId: string, message: string): Promise<UserSignature> {
  const { kid, publicJwk, privateKey } = await userKey(userId);
  return { kid, publicJwk: { ...publicJwk }, signature: await sign(privateKey, message) };
}

/** `userId`'s public key and kid (the key is created on first use). */
export async function getUserPublicKey(userId: string): Promise<UserPublicKey> {
  const { kid, publicJwk } = await userKey(userId);
  return { kid, publicJwk: { ...publicJwk } };
}

import { env } from '../config/env';
import { runtimePath } from '../config/runtime-path';
import { sign, type PublicJwk } from '../crypto';
import { loadOrCreateP256KeyFile, type P256KeyFile } from '../crypto/key-file';

// Server-held per-user signing keys (technical-plan §10, TP15). Server-only. Admin statements (custody
// transfers, overrides) are signed by the server on behalf of the signed-in admin with a P-256 key
// kept at DATA_DIR/keys/users/<userId>.jwk: it attests which account decided, not possession of a
// personal device key. Created on first use (0600 in a 0700 directory, atomically, the loser of a race
// reading the winner's key) and tightened on load, by crypto/key-file.ts (shared with the ledger key).
// The private member never leaves this module: not logged, not returned.

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

/** A user id safe to use as a file name (Better Auth and seeded ids fit). */
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const loaded = new Map<string, Promise<P256KeyFile>>();

function keyPath(userId: string): string {
  if (!USER_ID.test(userId)) throw new TypeError('signing key: invalid user id');
  return runtimePath(env.DATA_DIR, 'keys', 'users', `${userId}.jwk`);
}

function userKey(userId: string): Promise<P256KeyFile> {
  let path: string;
  try {
    path = keyPath(userId);
  } catch (err) {
    return Promise.reject(err);
  }
  let p = loaded.get(path);
  if (!p) {
    p = loadOrCreateP256KeyFile(path, { label: 'signing key', logPrefix: 'auth.signing_key', logFields: { userId } });
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

import { resolve } from 'node:path';
import { env } from '../config/env';
import { sign, type PublicJwk } from '../crypto';
import { loadOrCreateP256KeyFile } from '../crypto/key-file';

// The server's ledger key (technical-plan §8.2, N6). Server-only. It signs checkpoint statements.
// Generated on first use if LEDGER_KEY_PATH (default DATA_DIR/keys/ledger.jwk, git-ignored) is
// missing; the file is 0600 in a 0700 directory, created atomically, and looser modes found on load
// are tightened (all in crypto/key-file.ts, shared with the users' signing keys). The private member
// never leaves this module: it is not logged, not returned and not published.

export type LedgerKey = {
  /** RFC 7638 thumbprint of the public key. */
  kid: string;
  publicJwk: PublicJwk;
  /** ECDSA P-256 / SHA-256 over the UTF-8 bytes of `message`; P1363 r‖s, base64url. */
  sign(message: string): Promise<string>;
};

export type PublishedKey = PublicJwk & { kid: string; use: 'sig'; alg: 'ES256' };

const loaded = new Map<string, Promise<LedgerKey>>();

async function load(path: string): Promise<LedgerKey> {
  const { kid, publicJwk, privateKey } = await loadOrCreateP256KeyFile(path, { label: 'ledger key', logPrefix: 'ledger.key' });
  return { kid, publicJwk, sign: (message) => sign(privateKey, message) };
}

/**
 * The ledger key at `path`, generated (P-256) on the first call if the file does not exist. Loaded
 * once per process and path; concurrent first calls share one load. A failed load is not cached.
 */
export function loadLedgerKey(path: string = env.LEDGER_KEY_PATH): Promise<LedgerKey> {
  const abs = resolve(path);
  let p = loaded.get(abs);
  if (!p) {
    p = load(abs);
    loaded.set(abs, p);
    p.catch(() => loaded.delete(abs));
  }
  return p;
}

/** The public half as served at /.well-known/udgam-ledger-key: `{ keys: [jwk] }`. */
export async function publishedKeys(path: string = env.LEDGER_KEY_PATH): Promise<{ keys: PublishedKey[] }> {
  const key = await loadLedgerKey(path);
  return { keys: [{ ...key.publicJwk, kid: key.kid, use: 'sig', alg: 'ES256' }] };
}

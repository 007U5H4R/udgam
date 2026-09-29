import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env';
import { generateKeyPair, jwkThumbprint, publicMembers, sign, type PublicJwk } from '../crypto';
import { log } from '../log';

// The server's ledger key (technical-plan §8.2, N6). Server-only. It signs checkpoint statements.
// Generated on first use if LEDGER_KEY_PATH (default DATA_DIR/keys/ledger.jwk, git-ignored) is
// missing; the file is 0600 in a 0700 directory. The private member never leaves this module: it is
// not logged, not returned and not published.

export type LedgerKey = {
  /** RFC 7638 thumbprint of the public key. */
  kid: string;
  publicJwk: PublicJwk;
  /** ECDSA P-256 / SHA-256 over the UTF-8 bytes of `message`; P1363 r‖s, base64url. */
  sign(message: string): Promise<string>;
};

export type PublishedKey = PublicJwk & { kid: string; use: 'sig'; alg: 'ES256' };

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const loaded = new Map<string, Promise<LedgerKey>>();

const isNodeError = (err: unknown, code: string) => err instanceof Error && (err as NodeJS.ErrnoException).code === code;

async function fromPrivateJwk(jwk: JsonWebKey): Promise<LedgerKey> {
  if (typeof jwk?.d !== 'string' || jwk.d.length === 0) throw new TypeError('ledger key file is not a private JWK');
  let publicJwk: PublicJwk;
  try {
    publicJwk = publicMembers(jwk);
  } catch {
    throw new TypeError('ledger key file is not a P-256 JWK');
  }
  const { kty, crv, x, y, d } = jwk;
  const privateKey = await globalThis.crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, ALG, false, ['sign']);
  const kid = await jwkThumbprint(publicJwk);
  return { kid, publicJwk, sign: (message) => sign(privateKey, message) };
}

async function readKey(path: string): Promise<LedgerKey> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) throw err;
    throw new TypeError('ledger key file is not JSON');
  }
  return fromPrivateJwk(parsed as JsonWebKey);
}

async function generate(path: string): Promise<LedgerKey> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const pair = await generateKeyPair(true);
  const { kty, crv, x, y, d } = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  try {
    await writeFile(path, JSON.stringify({ kty, crv, x, y, d }), { mode: 0o600, flag: 'wx' });
  } catch (err) {
    // Another process won the race: use its key.
    if (isNodeError(err, 'EEXIST')) return readKey(path);
    throw err;
  }
  const key = await fromPrivateJwk({ kty, crv, x, y, d });
  log.info({ kid: key.kid }, 'ledger.key_generated');
  return key;
}

async function load(path: string): Promise<LedgerKey> {
  try {
    return await readKey(path);
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) return generate(path);
    throw err;
  }
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

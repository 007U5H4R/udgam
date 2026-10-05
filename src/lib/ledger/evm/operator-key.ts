import { randomBytes } from 'node:crypto';
import { chmod, link, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { isNodeError } from '../../crypto/key-file';
import { log } from '../../log';

// The EVM operator key (technical-plan TSK-24.3). SERVER-ONLY. A secp256k1 private key, generated on
// first use at EVM_OPERATOR_KEY_PATH (default DATA_DIR/keys/evm-operator.key, git-ignored), stored as
// one 0x-hex line in a 0600 file inside a 0700 directory. Created like the ledger key
// (crypto/key-file.ts): a complete temp file is hard-linked into place, so concurrent first calls agree
// on one key and the path never holds a partial file. The key is never logged or printed; only the
// operator ADDRESS (public) leaves this module in logs. Anvil's public dev keys are never used here.

export type Hex = `0x${string}`;

const KEY_RE = /^0x[0-9a-f]{64}$/;

export class OperatorKeyInvalid extends Error {
  constructor() {
    super('EVM operator key file is not a 0x-prefixed 32-byte hex key');
  }
}

async function readKey(path: string): Promise<Hex> {
  const text = (await readFile(path, 'utf8')).trim().toLowerCase();
  if (!KEY_RE.test(text)) throw new OperatorKeyInvalid();
  return text as Hex;
}

async function generate(path: string): Promise<Hex> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const key = generatePrivateKey();
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await open(tmp, 'wx', 0o600);
    try {
      await file.writeFile(`${key}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await link(tmp, path);
  } catch (err) {
    if (isNodeError(err, 'EEXIST')) return readKey(path);
    throw err;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
  log.info({ operator: privateKeyToAccount(key).address }, 'evm.operator_key_generated');
  return key;
}

/** Load the operator key at `path`, generating it if the file does not exist. Tightens a loose mode. */
export async function loadOrCreateOperatorKey(path: string): Promise<Hex> {
  const abs = resolve(path);
  let key: Hex;
  try {
    key = await readKey(abs);
  } catch (err) {
    if (isNodeError(err, 'ENOENT')) return generate(abs);
    throw err;
  }
  try {
    const s = await stat(abs);
    if (s.mode & 0o077) {
      await chmod(abs, 0o600);
      log.warn({ to: '600' }, 'evm.operator_key_mode_tightened');
    }
  } catch {
    log.warn({}, 'evm.operator_key_mode_unchecked');
  }
  return key;
}

/** Load the operator key at `path` without creating it (readers: the anchoring loop, audit). */
export function readOperatorKey(path: string): Promise<Hex> {
  return readKey(resolve(path));
}

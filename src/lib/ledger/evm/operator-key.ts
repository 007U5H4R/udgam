import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { loadOrCreateKeyFile, type KeyFileCodec } from '../../crypto/key-file';

// The EVM operator key (technical-plan TSK-24.3). SERVER-ONLY. A secp256k1 private key, generated on
// first use at EVM_OPERATOR_KEY_PATH (default DATA_DIR/keys/evm-operator.key, git-ignored), stored as
// one 0x-hex line in a 0600 file inside a 0700 directory. Created, and its file and directory modes
// tightened, by the shared key-file routine (crypto/key-file.ts, as the ledger key): a complete temp
// file is hard-linked into place, so concurrent first calls agree on one key and the path never holds
// a partial file. The key is never logged or printed; only the operator ADDRESS (public) leaves this
// module in logs. Anvil's public dev keys are never used here.

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

const codec: KeyFileCodec<Hex> = {
  read: readKey,
  async create() {
    const key = generatePrivateKey();
    return { contents: `${key}\n`, value: key };
  },
  generatedFields: (key) => ({ operator: privateKeyToAccount(key).address }),
};

/** Load the operator key at `path`, generating it if the file does not exist. Tightens loose modes. */
export function loadOrCreateOperatorKey(path: string): Promise<Hex> {
  return loadOrCreateKeyFile(resolve(path), codec, { logPrefix: 'evm.operator_key' });
}

/** Load the operator key at `path` without creating it (readers: the anchoring loop, audit). */
export function readOperatorKey(path: string): Promise<Hex> {
  return readKey(resolve(path));
}

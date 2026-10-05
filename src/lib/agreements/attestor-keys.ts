import { readFile } from 'node:fs/promises';
import { keccak256, recoverTypedDataAddress, toBytes, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { env } from '../config/env';
import { runtimePath } from '../config/runtime-path';
import { loadOrCreateKeyFile, type KeyFileCodec } from '../crypto/key-file';

// Server-held EVM keys per organisation (technical-plan TSK-25.5, TP15 pattern). SERVER-ONLY.
//
// Each buyer organisation has one secp256k1 key at DATA_DIR/keys/evm/<orgId>.key (one 0x-hex line, 0600
// in a 0700 directory, generated on first use by the shared key-file routine, crypto/key-file.ts, like
// the operator key: a complete temp file hard-linked into place, so concurrent first calls agree on one
// key; loose file and directory modes are tightened). It is the buyer's escrow wallet (approve,
// fund, refund) and its quality-grade attestor: the grade is an EIP-712 QualityGrade signature that
// ContractFarming recovers. It proves which buyer ACCOUNT decided, not possession of a personal device
// key, and the UI and docs say so. An FPO organisation's key only gives it a payee address. The key is
// never logged, printed or returned: only the address leaves this module.

/** EIP-712 domain name and version shared with contracts/src/ContractFarming.sol. */
export const GRADE_DOMAIN_NAME = 'Udgam ContractFarming';
export const GRADE_DOMAIN_VERSION = '1';

export const GRADE_TYPES = {
  QualityGrade: [
    { name: 'agreementId', type: 'bytes32' },
    { name: 'batchIdHash', type: 'bytes32' },
    { name: 'grade', type: 'uint8' },
  ],
} as const;

/** The contract a grade is signed for (the EIP-712 domain's chain and verifying contract). */
export type GradeDomain = { chainId: number; contract: Address };

export type GradeMessage = { agreementId: Hex; batchIdHash: Hex; grade: number };

/** ContractFarming's bytes32 id of an agreement: keccak256 of its UTF-8 id. */
export const agreementChainId = (agreementId: string): Hex => keccak256(toBytes(agreementId));

/** The bytes32 a grade names a batch by: keccak256 of its UTF-8 id. */
export const batchIdHash = (batchId: string): Hex => keccak256(toBytes(batchId));

const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^0x[0-9a-f]{64}$/;

export class OrgKeyInvalid extends Error {
  constructor() {
    super('organisation EVM key file is not a 0x-prefixed 32-byte hex key');
  }
}

/** DATA_DIR/keys/evm/<orgId>.key */
export function orgKeyPath(orgId: string, dataDir: string = env.DATA_DIR): string {
  if (!ORG_ID.test(orgId)) throw new TypeError('organisation EVM key: invalid organisation id');
  return runtimePath(dataDir, 'keys', 'evm', `${orgId}.key`);
}

async function readKey(path: string): Promise<Hex> {
  const text = (await readFile(path, 'utf8')).trim().toLowerCase();
  if (!KEY_RE.test(text)) throw new OrgKeyInvalid();
  return text as Hex;
}

const codec: KeyFileCodec<Hex> = {
  read: readKey,
  async create() {
    const key = generatePrivateKey();
    return { contents: `${key}\n`, value: key };
  },
  generatedFields: (key) => ({ address: privateKeyToAccount(key).address }),
};

/** The key at `path`, created on first use; file and directory modes tightened (crypto/key-file.ts). */
function loadOrCreate(path: string, orgId: string): Promise<Hex> {
  return loadOrCreateKeyFile(path, codec, { logPrefix: 'agreements.org_key', logFields: { orgId } });
}

const accounts = new Map<string, Promise<PrivateKeyAccount>>();

/** The organisation's EVM account (its key is created on first use). Server-internal: never serialise it. */
export function orgAccount(orgId: string): Promise<PrivateKeyAccount> {
  let path: string;
  try {
    path = orgKeyPath(orgId);
  } catch (e) {
    return Promise.reject(e);
  }
  let p = accounts.get(path);
  if (!p) {
    p = loadOrCreate(path, orgId).then((k) => privateKeyToAccount(k));
    accounts.set(path, p);
    p.catch(() => accounts.delete(path)); // a failed load is not cached
  }
  return p;
}

/** The organisation's EVM address (public). */
export async function orgAddress(orgId: string): Promise<Address> {
  return (await orgAccount(orgId)).address;
}

const typed = (domain: GradeDomain, m: GradeMessage) =>
  ({
    domain: { name: GRADE_DOMAIN_NAME, version: GRADE_DOMAIN_VERSION, chainId: domain.chainId, verifyingContract: domain.contract },
    types: GRADE_TYPES,
    primaryType: 'QualityGrade',
    message: { agreementId: m.agreementId, batchIdHash: m.batchIdHash, grade: m.grade },
  }) as const;

/** The buyer organisation's EIP-712 signature over QualityGrade(agreementId, batchIdHash, grade). */
export async function signGrade(orgId: string, m: GradeMessage, domain: GradeDomain): Promise<Hex> {
  if (!Number.isInteger(m.grade) || m.grade < 0 || m.grade > 100) throw new RangeError('grade must be an integer 0–100');
  const account = await orgAccount(orgId);
  return account.signTypedData(typed(domain, m));
}

/** The address a grade signature recovers to (throws on a malformed signature). */
export function recoverGradeSigner(m: GradeMessage, signature: Hex, domain: GradeDomain): Promise<Address> {
  return recoverTypedDataAddress({ ...typed(domain, m), signature });
}

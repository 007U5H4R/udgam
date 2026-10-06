import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  http,
  parseEther,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import farmingAbi from './abi/ContractFarming.json';
import tokenAbi from './abi/MockINR.json';
import { blockWindows, LOG_RANGE_BLOCKS } from '../ledger/evm/log-range';
import { evmAccount, exclusive, receiptOf, sendFrom } from '../ledger/evm/sender';
import { orgAccount, type GradeDomain } from './attestor-keys';
import type { EscrowDeployment } from './deployment';

// The escrow on chain (technical-plan TSK-25.6/25.7): ContractFarming + MockINR through viem.
// SERVER-ONLY. Never called inside a DB transaction: callers make the chain call, wait for the receipt,
// then record the result in one writeTx.
//
// Accounts: the operator (the Udgam server, the only createAgreement/settle/mint caller) and one
// server-held key per buyer organisation (attestor-keys.ts) that approves, funds and refunds. On a fresh
// buyer account the operator tops up gas and mints mock INR (not real money).
//
// Errors are classified for the screens (Design.md §28.6): `no_answer` (the ledger did not answer: RPC
// down, timeout, missing deployment) means nothing moved and nothing was judged; `turned_away` (the
// contract reverted) means the ledger refused the request before judging it.
//
// Sends from one account never overlap in this process (ledger/evm/sender.ts, SEC-200): the operator is
// shared with the anchoring loop and between buyers' actions, and a buyer's approve/fund pair holds its
// account so two fundings cannot interleave their allowances.

export const FARMING_ABI = farmingAbi as Abi;
export const TOKEN_ABI = tokenAbi as Abi;

/** Mock INR (paise) a buyer organisation starts with: ₹10,00,000.00 — not real money. */
export const STARTING_BALANCE_PAISE = BigInt(100_000_000);
const MIN_GAS = parseEther('0.2');
const GAS_TOP_UP = parseEther('1');

export type ChainErrorKind = 'no_answer' | 'turned_away';

export class ChainError extends Error {
  constructor(
    readonly kind: ChainErrorKind,
    /** The contract's error name when it reverted (e.g. BadGradeSignature), else a short cause. */
    readonly reason: string,
  ) {
    super(`escrow ${kind}: ${reason}`);
    this.name = 'ChainError';
  }
}

/** A viem error → ChainError (a revert names its contract error; anything else is no answer). */
export function toChainError(e: unknown): ChainError {
  if (e instanceof ChainError) return e;
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return new ChainError('turned_away', revert.data?.errorName ?? revert.reason ?? 'reverted');
    return new ChainError('no_answer', e.shortMessage.slice(0, 200));
  }
  return new ChainError('no_answer', e instanceof Error ? e.message.split('\n')[0]!.slice(0, 200) : 'unknown');
}

export type ChainTx = { txHash: Hex; blockNumber: number };
export type OnChainStatus = 'none' | 'created' | 'funded' | 'settled' | 'refunded';
const STATUS: OnChainStatus[] = ['none', 'created', 'funded', 'settled', 'refunded'];

export type CreateTerms = {
  id: Hex;
  buyerOrg: string;
  fpoPayee: Address;
  agreedGrams: bigint;
  minGrade: number;
  amountPaise: bigint;
  /** Unix seconds. */
  deadline: bigint;
};

export type SettleArgs = { id: Hex; batchIdHash: Hex; deliveredGrams: bigint; allVerified: boolean; grade: number; gradeSig: Hex };
/** The facts a settle call sent to the contract (read back from its calldata when a release is recovered). */
export type SentFacts = { deliveredGrams: bigint; allVerified: boolean; grade: number };
/** `reasons` is the contract's bitmask: 1 quantity, 2 grade, 4 verification (0 when released). `sent`: on a recovered release only. */
export type SettleOutcome = ChainTx & { released: boolean; reasons: number; sent?: SentFacts | null };
/** An earlier release, with the facts its settle call sent (null when the calldata could not be read). */
export type SettledTx = ChainTx & { sent: SentFacts | null };

export interface EscrowChain {
  chainId: number;
  escrow: Address;
  token: Address;
  gradeDomain(): GradeDomain;
  /** The agreement's state on chain. */
  status(id: Hex): Promise<OnChainStatus>;
  /** A buyer organisation's mock INR balance in paise. */
  balanceOf(orgId: string): Promise<bigint>;
  /** Gas and mock INR for a buyer organisation's account, so it can fund `amountPaise`. */
  ensureBuyer(orgId: string, amountPaise: bigint): Promise<void>;
  createAgreement(t: CreateTerms): Promise<ChainTx>;
  fund(orgId: string, id: Hex, amountPaise: bigint): Promise<ChainTx>;
  refund(orgId: string, id: Hex): Promise<ChainTx>;
  settle(a: SettleArgs): Promise<SettleOutcome>;
  /** The tx of an earlier release of `id` for this batch and the facts it sent, or null (recovers a settle whose record was lost). */
  settledTx(id: Hex, batchIdHash: Hex): Promise<SettledTx | null>;
}

export type EscrowChainOptions = {
  rpcUrl: string;
  deployment: EscrowDeployment;
  operatorKey: Hex;
  timeoutMs?: number;
  /** Blocks per eth_getLogs call in the recovery scan (default LOG_RANGE_BLOCKS, 5,000): hosted RPCs cap it. */
  logRangeBlocks?: number;
  /** Observe each JSON-RPC request (tests). */
  onFetchRequest?: (request: Request) => void | Promise<void>;
};

type Log = TransactionReceipt['logs'][number];

/** The facts a `settle(id, batchIdHash, deliveredGrams, allVerified, grade, gradeSig)` calldata carries, or null. */
export function sentFacts(input: Hex): SentFacts | null {
  try {
    const call = decodeFunctionData({ abi: FARMING_ABI, data: input });
    if (call.functionName !== 'settle' || !call.args) return null;
    const [, , deliveredGrams, allVerified, grade] = call.args as readonly unknown[];
    if (typeof deliveredGrams !== 'bigint' || typeof allVerified !== 'boolean' || typeof grade !== 'number') return null;
    return { deliveredGrams, allVerified, grade };
  } catch {
    return null;
  }
}

export function createEscrowChain(o: EscrowChainOptions): EscrowChain {
  const { deployment: d } = o;
  const chain = defineChain({
    id: d.chainId,
    name: `udgam-evm-${d.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [o.rpcUrl] } },
  });
  const transport = http(o.rpcUrl, { retryCount: 0, timeout: o.timeoutMs ?? 10_000, onFetchRequest: o.onFetchRequest });
  const pub = createPublicClient({ chain, transport, pollingInterval: 250 }) as PublicClient;
  const logRange = BigInt(Math.max(1, o.logRangeBlocks ?? LOG_RANGE_BLOCKS));
  const operator = evmAccount(o.operatorKey);
  if (operator.address.toLowerCase() !== d.operator.toLowerCase()) throw new Error('EVM operator key does not match the escrow deployment operator');
  const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain, transport, pollingInterval: 250 });

  const read = <T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []) => pub.readContract({ address, abi, functionName, args }) as Promise<T>;

  /** Simulate (so a revert names its error), send, and wait for a successful receipt. */
  async function send(account: PrivateKeyAccount, address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<TransactionReceipt> {
    try {
      const hash = await sendFrom(account.address, d.chainId, async () => {
        const { request } = await pub.simulateContract({ account, address, abi, functionName, args, chain });
        return wallet(account).writeContract(request);
      });
      const receipt = await receiptOf(account.address, d.chainId, () => pub.waitForTransactionReceipt({ hash, timeout: o.timeoutMs ?? 30_000 }));
      if (receipt.status !== 'success') throw new ChainError('turned_away', `${functionName} reverted`);
      return receipt;
    } catch (e) {
      throw toChainError(e);
    }
  }

  const txOf = (r: TransactionReceipt): ChainTx => ({ txHash: r.transactionHash, blockNumber: Number(r.blockNumber) });

  function decode(log: Log): { eventName: string; args: Record<string, unknown> } | null {
    if (log.address.toLowerCase() !== d.escrow.toLowerCase()) return null;
    try {
      const x = decodeEventLog({ abi: FARMING_ABI, data: log.data, topics: log.topics });
      return { eventName: String(x.eventName), args: x.args as unknown as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  /**
   * The tx of the latest earlier event for `id` (recovers a call whose receipt was lost before it was
   * recorded). Reads logs in windows of `logRangeBlocks`, newest first, back to the deployment block,
   * because hosted RPCs cap the range of one eth_getLogs (as the registry client's anchoredLog does).
   */
  async function earlier(eventName: string, id: Hex, batchIdHash?: Hex): Promise<ChainTx | null> {
    const args = batchIdHash === undefined ? { id } : { id, batchIdHash };
    const head = await pub.getBlockNumber({ cacheTime: 0 });
    for (const [fromBlock, toBlock] of blockWindows(BigInt(d.deployedAtBlock), head, logRange, 'newest-first')) {
      const logs = await pub.getContractEvents({ address: d.escrow, abi: FARMING_ABI, eventName, args, fromBlock, toBlock });
      const log = logs.filter((l) => l.transactionHash && l.blockNumber !== null).at(-1);
      if (log?.transactionHash && log.blockNumber !== null) return { txHash: log.transactionHash, blockNumber: Number(log.blockNumber) };
    }
    return null;
  }

  async function status(id: Hex): Promise<OnChainStatus> {
    try {
      const a = await read<readonly unknown[]>(d.escrow, FARMING_ABI, 'agreements', [id]);
      return STATUS[Number(a[7])] ?? 'none';
    } catch (e) {
      throw toChainError(e);
    }
  }

  async function balanceOf(orgId: string): Promise<bigint> {
    const account = await orgAccount(orgId);
    try {
      return await read<bigint>(d.token, TOKEN_ABI, 'balanceOf', [account.address]);
    } catch (e) {
      throw toChainError(e);
    }
  }

  return {
    chainId: d.chainId,
    escrow: d.escrow,
    token: d.token,
    gradeDomain: () => ({ chainId: d.chainId, contract: d.escrow }),
    status,
    balanceOf,

    async ensureBuyer(orgId, amountPaise) {
      const account = await orgAccount(orgId);
      try {
        if ((await pub.getBalance({ address: account.address })) < MIN_GAS) {
          const hash = await sendFrom(operator.address, d.chainId, () => wallet(operator).sendTransaction({ account: operator, to: account.address, value: GAS_TOP_UP, chain }));
          await receiptOf(operator.address, d.chainId, () => pub.waitForTransactionReceipt({ hash, timeout: o.timeoutMs ?? 30_000 }));
        }
      } catch (e) {
        throw toChainError(e);
      }
      const have = await balanceOf(orgId);
      const want = amountPaise > STARTING_BALANCE_PAISE ? amountPaise : STARTING_BALANCE_PAISE;
      if (have === BigInt(0) || have < amountPaise) await send(operator, d.token, TOKEN_ABI, 'mint', [account.address, want - have]);
    },

    async createAgreement(t) {
      if ((await status(t.id)) !== 'none') {
        const tx = await earlier('AgreementCreated', t.id).catch((e) => Promise.reject(toChainError(e)));
        if (tx) return tx;
      }
      const attestor = (await orgAccount(t.buyerOrg)).address;
      return txOf(await send(operator, d.escrow, FARMING_ABI, 'createAgreement', [t.id, attestor, attestor, t.fpoPayee, t.agreedGrams, t.minGrade, t.amountPaise, t.deadline]));
    },

    async fund(orgId, id, amountPaise) {
      if ((await status(id)) === 'funded') {
        const tx = await earlier('Funded', id).catch((e) => Promise.reject(toChainError(e)));
        if (tx) return tx;
      }
      const account = await orgAccount(orgId);
      // approve then fund, holding the buyer's account: another funding's approve in between would
      // overwrite this allowance and its own fund would take it.
      return exclusive(account.address, d.chainId, async () => {
        await send(account, d.token, TOKEN_ABI, 'approve', [d.escrow, amountPaise]);
        return txOf(await send(account, d.escrow, FARMING_ABI, 'fund', [id]));
      });
    },

    async refund(orgId, id) {
      if ((await status(id)) === 'refunded') {
        const tx = await earlier('Refunded', id).catch((e) => Promise.reject(toChainError(e)));
        if (tx) return tx;
      }
      return txOf(await send(await orgAccount(orgId), d.escrow, FARMING_ABI, 'refund', [id]));
    },

    async settle(a) {
      const receipt = await send(operator, d.escrow, FARMING_ABI, 'settle', [a.id, a.batchIdHash, a.deliveredGrams, a.allVerified, a.grade, a.gradeSig]);
      for (const log of receipt.logs) {
        const ev = decode(log);
        if (ev?.eventName === 'Settled') return { ...txOf(receipt), released: true, reasons: 0 };
        if (ev?.eventName === 'SettlementRejected') return { ...txOf(receipt), released: false, reasons: Number(ev.args.reasons) };
      }
      throw new ChainError('turned_away', 'settle emitted no outcome');
    },

    async settledTx(id, batchIdHash) {
      try {
        const tx = await earlier('Settled', id, batchIdHash);
        if (!tx) return null;
        return { ...tx, sent: sentFacts((await pub.getTransaction({ hash: tx.txHash })).input) };
      } catch (e) {
        throw toChainError(e);
      }
    },
  };
}

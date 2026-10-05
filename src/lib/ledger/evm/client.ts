import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import abiJson from './abi/BatchRegistry.json';
import type { Deployment } from './deployment';

// A viem client for BatchRegistry (technical-plan TSK-24.4). SERVER-ONLY. Ledger hashes are 64 lowercase
// hex without a prefix (§8.1); on chain they are bytes32. The operator key is optional: without it the
// client only reads (audit, proof checks) and append() throws.

export const BATCH_REGISTRY_ABI = abiJson as Abi;

export type AnchorReceipt = { txHash: Hex; blockNumber: number };
export type AnchoredLog = AnchorReceipt & { seq: number; entryHash: string };

export type RegistryClient = {
  chainId: number;
  registry: Address;
  operator: Address;
  /** Blocks (including its own) an anchor needs before it is recorded (deployment.json; default 1). */
  confirmations: number;
  /** The chain head's block number. */
  blockNumber(): Promise<number>;
  /** The chain id the RPC reports (must equal the deployment's). */
  rpcChainId(): Promise<number>;
  /** Send append(seq, entryHash) and wait for the receipt with `confirmations`. Throws on a revert or a dead RPC. */
  append(seq: number, entryHash: string): Promise<AnchorReceipt>;
  /** The hash anchored at `seq` (64 lowercase hex), or null when nothing is anchored there. */
  entryHash(seq: number): Promise<string | null>;
  nextSeq(): Promise<number>;
  /**
   * The EntryAnchored log for `seq`, if any (recovers a tx sent before a crash). Scans in bounded block
   * ranges from `fromBlock` (the last anchored seq's block; never before the deployment) to the head.
   */
  anchoredLog(seq: number, fromBlock?: number): Promise<AnchoredLog | null>;
  /** Every EntryAnchored log in a mined transaction, with its block; null if the tx is unknown. */
  receiptLogs(txHash: Hex): Promise<{ blockNumber: number; success: boolean; logs: { seq: number; entryHash: string }[] } | null>;
};

export type RegistryClientOptions = {
  rpcUrl: string;
  deployment: Deployment;
  operatorKey?: Hex;
  timeoutMs?: number;
  /** Blocks per eth_getLogs call (default 5,000): hosted RPCs cap the range of one log query. */
  logRangeBlocks?: number;
  /** Observe each JSON-RPC request (tests). */
  onFetchRequest?: (request: Request) => void | Promise<void>;
};

export const LOG_RANGE_BLOCKS = 5_000;
/** A generous block time for the receipt wait: about 12 s on Ethereum-like chains, with slack. */
export const RECEIPT_MS_PER_CONFIRMATION = 15_000;

/**
 * How long append waits for its receipt (TASK-25 r2 #3): the base timeout for the first block, plus one
 * block time for every further confirmation, so 12 confirmations on a 12 s chain do not time out.
 */
export function receiptTimeoutMs(confirmations: number, baseMs = 30_000): number {
  return baseMs + Math.max(0, confirmations - 1) * RECEIPT_MS_PER_CONFIRMATION;
}

const HASH_RE = /^[0-9a-f]{64}$/;
const ZERO = '0'.repeat(64);
const toBytes32 = (h: string): Hex => {
  if (!HASH_RE.test(h)) throw new TypeError('entry hash must be 64 lowercase hex');
  return `0x${h}`;
};
const fromBytes32 = (h: Hex): string => h.slice(2).toLowerCase();

export function createRegistryClient(o: RegistryClientOptions): RegistryClient {
  const { deployment } = o;
  const chain = defineChain({
    id: deployment.chainId,
    name: `udgam-evm-${deployment.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [o.rpcUrl] } },
  });
  const transport = http(o.rpcUrl, { retryCount: 0, timeout: o.timeoutMs ?? 10_000, onFetchRequest: o.onFetchRequest });
  const confirmations = deployment.confirmations ?? 1;
  const logRange = BigInt(Math.max(1, o.logRangeBlocks ?? LOG_RANGE_BLOCKS));
  const pub = createPublicClient({ chain, transport, pollingInterval: 250 });
  const account = o.operatorKey ? privateKeyToAccount(o.operatorKey) : undefined;
  if (account && account.address.toLowerCase() !== deployment.operator.toLowerCase()) {
    throw new Error('EVM operator key does not match the deployment operator');
  }
  const wallet = account ? createWalletClient({ account, chain, transport, pollingInterval: 250 }) : undefined;
  const registry = deployment.registry;
  const read = <T>(functionName: string, args: unknown[] = []) => pub.readContract({ address: registry, abi: BATCH_REGISTRY_ABI, functionName, args }) as Promise<T>;

  const decode = (log: { data: Hex; topics: [Hex, ...Hex[]] | [] }) => {
    try {
      const d = decodeEventLog({ abi: BATCH_REGISTRY_ABI, data: log.data, topics: log.topics, eventName: 'EntryAnchored' });
      const args = d.args as unknown as { seq: bigint; entryHash: Hex };
      return { seq: Number(args.seq), entryHash: fromBytes32(args.entryHash) };
    } catch {
      return null;
    }
  };

  return {
    chainId: deployment.chainId,
    registry,
    operator: deployment.operator,
    confirmations,
    rpcChainId: () => pub.getChainId(),
    blockNumber: async () => Number(await pub.getBlockNumber({ cacheTime: 0 })),
    async append(seq, entryHash) {
      if (!wallet || !account) throw new Error('EVM registry client has no operator key: read-only');
      const txHash = await wallet.writeContract({ address: registry, abi: BATCH_REGISTRY_ABI, functionName: 'append', args: [BigInt(seq), toBytes32(entryHash)], account, chain });
      // Recorded only after `confirmations` blocks (1 on Anvil). A reorg deeper than that is caught by
      // `pnpm ledger:audit` and the §13.2 check, never repaired silently (docs/proof-feed.md §13.3).
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, confirmations, timeout: receiptTimeoutMs(confirmations, o.timeoutMs ?? 30_000) });
      if (receipt.status !== 'success') throw new Error(`append(${seq}) reverted in tx ${txHash}`);
      return { txHash, blockNumber: Number(receipt.blockNumber) };
    },
    async entryHash(seq) {
      const h = fromBytes32(await read<Hex>('entryHash', [BigInt(seq)]));
      return h === ZERO ? null : h;
    },
    async nextSeq() {
      return Number(await read<bigint>('nextSeq'));
    },
    async anchoredLog(seq, fromBlock) {
      const head = await pub.getBlockNumber({ cacheTime: 0 });
      const start = BigInt(Math.max(deployment.deployedAtBlock, fromBlock ?? 0));
      for (let from = start; from <= head; from += logRange) {
        const to = from + logRange - BigInt(1) < head ? from + logRange - BigInt(1) : head;
        const logs = await pub.getContractEvents({
          address: registry,
          abi: BATCH_REGISTRY_ABI,
          eventName: 'EntryAnchored',
          args: { seq: BigInt(seq) },
          fromBlock: from,
          toBlock: to,
        });
        const log = logs.find((l) => l.transactionHash && l.blockNumber !== null);
        if (!log || !log.transactionHash || log.blockNumber === null) continue;
        const args = (log as unknown as { args: { seq: bigint; entryHash: Hex } }).args;
        return { seq: Number(args.seq), entryHash: fromBytes32(args.entryHash), txHash: log.transactionHash, blockNumber: Number(log.blockNumber) };
      }
      return null;
    },
    async receiptLogs(txHash) {
      let receipt;
      try {
        receipt = await pub.getTransactionReceipt({ hash: txHash });
      } catch {
        return null;
      }
      const logs = receipt.logs
        .filter((l) => l.address.toLowerCase() === registry.toLowerCase())
        .map((l) => decode(l as unknown as { data: Hex; topics: [Hex, ...Hex[]] }))
        .filter((l): l is { seq: number; entryHash: string } => l !== null);
      return { blockNumber: Number(receipt.blockNumber), success: receipt.status === 'success', logs };
    },
  };
}

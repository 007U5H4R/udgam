import type { AnchorReceipt, RegistryClient } from '../client';

// An in-memory BatchRegistry for adapter tests that do not need Anvil (TASK-25 fix round 1). It keeps
// the contract's rules (operator-only is implied; seq must equal nextSeq; no overwrite) and counts calls,
// and each RPC can be slowed down or made to fail, so coalescing and retry paths are testable offline.

export type FakeRegistryOptions = {
  chainId?: number;
  /** Delay every RPC by this many ms (a slow chain). */
  delayMs?: number;
  /** When set, rpcChainId() rejects with this message (a dead or timing-out RPC). */
  rpcError?: string;
  confirmations?: number;
};

export type FakeRegistry = RegistryClient & {
  calls: Record<'rpcChainId' | 'append' | 'entryHash' | 'nextSeq' | 'anchoredLog' | 'receiptLogs' | 'blockNumber', number>;
  hashes: Map<number, string>;
  /** Override entryHash(seq) answers (e.g. null from a lagging replica). */
  entryHashOverride?: (seq: number) => string | null | undefined;
  set(o: Partial<FakeRegistryOptions>): void;
  /** Mine `n` empty blocks. */
  mine(n: number): void;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fakeRegistry(opts: FakeRegistryOptions = {}): FakeRegistry {
  const o: FakeRegistryOptions = { chainId: 31337, delayMs: 0, confirmations: 1, ...opts };
  const hashes = new Map<number, string>();
  const receipts = new Map<number, AnchorReceipt>();
  let block = 1;
  const calls: FakeRegistry['calls'] = { rpcChainId: 0, append: 0, entryHash: 0, nextSeq: 0, anchoredLog: 0, receiptLogs: 0, blockNumber: 0 };
  const rpc = async <T>(name: keyof FakeRegistry['calls'], f: () => T): Promise<T> => {
    calls[name]++;
    if (o.delayMs) await delay(o.delayMs);
    return f();
  };
  const reg: FakeRegistry = {
    chainId: o.chainId!,
    registry: `0x${'5f'.repeat(20)}`,
    operator: `0x${'0a'.repeat(20)}`,
    get confirmations() {
      return o.confirmations ?? 1;
    },
    calls,
    hashes,
    set(p) {
      Object.assign(o, p);
    },
    mine(n) {
      block += n;
    },
    rpcChainId: () =>
      rpc('rpcChainId', () => {
        if (o.rpcError) throw new Error(o.rpcError);
        return o.chainId!;
      }),
    append: (seq, entryHash) =>
      rpc('append', () => {
        if (seq !== hashes.size + 1) throw new Error(`OutOfOrder(${seq})`);
        hashes.set(seq, entryHash);
        block++;
        const r = { txHash: `0x${seq.toString(16).padStart(64, '0')}` as const, blockNumber: block };
        receipts.set(seq, r);
        return r;
      }),
    entryHash: (seq) =>
      rpc('entryHash', () => {
        const forced = reg.entryHashOverride?.(seq);
        return forced !== undefined ? forced : (hashes.get(seq) ?? null);
      }),
    nextSeq: () => rpc('nextSeq', () => hashes.size + 1),
    blockNumber: () => rpc('blockNumber', () => block),
    anchoredLog: (seq) =>
      rpc('anchoredLog', () => {
        const r = receipts.get(seq);
        return r ? { ...r, seq, entryHash: hashes.get(seq)! } : null;
      }),
    receiptLogs: (txHash) =>
      rpc('receiptLogs', () => {
        for (const [seq, r] of receipts) if (r.txHash === txHash) return { blockNumber: r.blockNumber, success: true, logs: [{ seq, entryHash: hashes.get(seq)! }] };
        return null;
      }),
  };
  return reg;
}

import type { RegistryClient } from './client';

// Check a proof feed's optional `evm` fields against the chain (EVAL-103, TC-083; docs/proof-feed.md
// §13.2). For every entry: the field says anchored and carries a well-formed chainId, contract, txHash
// and blockNumber; chainId and contract are the PINNED registry's (the client's, never taken from the
// feed); the registry holds the entry's hash at its seq; and the named transaction exists, succeeded,
// was mined in the named block, and emitted EntryAnchored(seq, entryHash) from the registry. Each
// failure names its step. Needs RPC access, so it runs server-side (harness, audit), never in the browser.

export type AnchorCheckStep = 'evm-field' | 'malformed' | 'chain' | 'contract' | 'registry-hash' | 'tx-not-found' | 'tx-status' | 'tx-block' | 'log';

export type AnchorCheckFailure = { seq: number; step: AnchorCheckStep; detail: string };

export type FeedAnchorCheck = { ok: boolean; checked: number; anchored: number; problems: string[]; failures: AnchorCheckFailure[] };

type FeedLike = { entries: { seq: number; entryHash: string; evm?: unknown }[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function checkEntry(e: FeedLike['entries'][number], client: RegistryClient): Promise<{ step: AnchorCheckStep; detail: string } | null> {
  const evm = e.evm;
  if (!isObj(evm) || evm.status !== 'anchored') return { step: 'evm-field', detail: `not anchored (${isObj(evm) ? String(evm.status) : 'no evm field'})` };
  const { chainId, contract, txHash, blockNumber } = evm;
  if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(txHash) || typeof blockNumber !== 'number' || !Number.isSafeInteger(blockNumber) || typeof contract !== 'string') {
    return { step: 'malformed', detail: 'txHash, blockNumber or contract missing or malformed' };
  }
  if (chainId !== client.chainId) return { step: 'chain', detail: `names chain ${String(chainId)}, the pinned registry is on chain ${client.chainId}` };
  if (contract.toLowerCase() !== client.registry.toLowerCase()) return { step: 'contract', detail: `names contract ${contract}, not the pinned registry ${client.registry.toLowerCase()}` };
  const onChain = await client.entryHash(e.seq);
  if (onChain !== e.entryHash) return { step: 'registry-hash', detail: `registry holds ${onChain ?? 'nothing'}, the feed says ${e.entryHash}` };
  const receipt = await client.receiptLogs(txHash as `0x${string}`);
  if (!receipt) return { step: 'tx-not-found', detail: `transaction ${txHash} is not on chain` };
  if (!receipt.success) return { step: 'tx-status', detail: `transaction ${txHash} reverted` };
  if (receipt.blockNumber !== blockNumber) return { step: 'tx-block', detail: `transaction ${txHash} is in block ${receipt.blockNumber}, the feed says block ${blockNumber}` };
  if (!receipt.logs.some((l) => l.seq === e.seq && l.entryHash === e.entryHash)) return { step: 'log', detail: `transaction ${txHash} emitted no EntryAnchored for this seq and hash` };
  return null;
}

export async function checkFeedAnchors(feed: FeedLike, client: RegistryClient): Promise<FeedAnchorCheck> {
  const failures: AnchorCheckFailure[] = [];
  let anchored = 0;
  for (const e of feed.entries) {
    const f = await checkEntry(e, client);
    if (f) failures.push({ seq: e.seq, ...f });
    else anchored++;
  }
  const problems = failures.map((f) => `seq ${f.seq}: [${f.step}] ${f.detail}`);
  return { ok: failures.length === 0 && feed.entries.length > 0, checked: feed.entries.length, anchored, problems, failures };
}

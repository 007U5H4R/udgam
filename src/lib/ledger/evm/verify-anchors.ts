import type { RegistryClient } from './client';

// Check a proof feed's optional `evm` fields against the chain (EVAL-103, TC-083; docs/proof-feed.md
// "EVM extension"). For every entry: the field says anchored, carries chainId, contract, txHash and
// blockNumber; the registry holds the entry's hash at its seq; and the named transaction was mined in the
// named block, succeeded, and emitted EntryAnchored(seq, entryHash) from the registry. Needs RPC access,
// so it runs server-side (harness, audit), never in the browser.

export type FeedAnchorCheck = { ok: boolean; checked: number; anchored: number; problems: string[] };

type FeedLike = { entries: { seq: number; entryHash: string; evm?: unknown }[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function checkFeedAnchors(feed: FeedLike, client: RegistryClient): Promise<FeedAnchorCheck> {
  const problems: string[] = [];
  let anchored = 0;
  for (const e of feed.entries) {
    const evm = e.evm;
    if (!isObj(evm) || evm.status !== 'anchored') {
      problems.push(`seq ${e.seq}: not anchored (${isObj(evm) ? String(evm.status) : 'no evm field'})`);
      continue;
    }
    const { chainId, contract, txHash, blockNumber } = evm;
    if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(txHash) || typeof blockNumber !== 'number' || !Number.isSafeInteger(blockNumber)) {
      problems.push(`seq ${e.seq}: txHash or blockNumber missing or malformed`);
      continue;
    }
    if (chainId !== client.chainId || typeof contract !== 'string' || contract.toLowerCase() !== client.registry.toLowerCase()) {
      problems.push(`seq ${e.seq}: names chain ${String(chainId)} / contract ${String(contract)}, not this registry`);
      continue;
    }
    const onChain = await client.entryHash(e.seq);
    if (onChain !== e.entryHash) {
      problems.push(`seq ${e.seq}: registry holds ${onChain ?? 'nothing'}, the feed says ${e.entryHash}`);
      continue;
    }
    const receipt = await client.receiptLogs(txHash as `0x${string}`);
    if (!receipt) {
      problems.push(`seq ${e.seq}: transaction ${txHash} is not on chain`);
      continue;
    }
    if (!receipt.success || receipt.blockNumber !== blockNumber) {
      problems.push(`seq ${e.seq}: transaction ${txHash} is in block ${receipt.blockNumber} (success ${receipt.success}), the feed says block ${blockNumber}`);
      continue;
    }
    if (!receipt.logs.some((l) => l.seq === e.seq && l.entryHash === e.entryHash)) {
      problems.push(`seq ${e.seq}: transaction ${txHash} emitted no EntryAnchored for this seq and hash`);
      continue;
    }
    anchored++;
  }
  return { ok: problems.length === 0 && feed.entries.length > 0, checked: feed.entries.length, anchored, problems };
}

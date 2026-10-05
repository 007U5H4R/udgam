import { asc, eq, gt } from 'drizzle-orm';
import { sha256Hex } from '../../crypto';
import type { Db } from '../../db/client';
import { evmAnchors, ledgerEntries } from '../../db/schema';
import { entryHashOf } from '../hashchain';
import type { RegistryClient } from './client';

// Ledger audit against the chain (technical-plan TSK-24.8, EVAL-104). SERVER-ONLY. For every ledger
// entry the chain has anchored, the stored entry_hash AND the entry hash recomputed from the stored
// row (payload → payload_hash → entry header) must both equal registry.entryHash(seq). A row altered
// after anchoring, by any writer that got past the append-only triggers, fails one or both. Also
// reported: anchors the database claims that the chain does not hold, and on-chain seqs missing from the
// ledger (a deleted tail). Entries not yet on chain are counted as pending, not as mismatches.

export type AuditReason =
  | 'stored-entry-hash-differs-from-chain'
  | 'recomputed-entry-hash-differs-from-chain'
  | 'anchored-in-db-but-not-on-chain'
  | 'on-chain-but-missing-from-ledger';

export type AuditMismatch = { seq: number; reasons: AuditReason[] };

export type AuditReport = {
  ok: boolean;
  chainId: number;
  registry: string;
  /** Ledger entries read. */
  entries: number;
  /** Entries compared with an on-chain hash. */
  compared: number;
  /** Entries after the registry's last anchored seq (anchor lags the DB commit). */
  pendingNotOnChain: number;
  mismatches: AuditMismatch[];
};

const PAGE = 500;

export async function auditLedger(db: Db, client: RegistryClient): Promise<AuditReport> {
  const chainNext = await client.nextSeq();
  const anchoredInDb = new Set(
    (await db.select({ seq: evmAnchors.seq }).from(evmAnchors).where(eq(evmAnchors.status, 'anchored'))).map((r) => r.seq),
  );
  const mismatches: AuditMismatch[] = [];
  let entries = 0;
  let compared = 0;
  let pendingNotOnChain = 0;
  let lastSeq = 0;
  for (;;) {
    const page = await db.select().from(ledgerEntries).where(gt(ledgerEntries.seq, lastSeq)).orderBy(asc(ledgerEntries.seq)).limit(PAGE);
    for (const e of page) {
      entries++;
      lastSeq = e.seq;
      if (e.seq >= chainNext) {
        if (anchoredInDb.has(e.seq)) mismatches.push({ seq: e.seq, reasons: ['anchored-in-db-but-not-on-chain'] });
        else pendingNotOnChain++;
        continue;
      }
      compared++;
      const onChain = await client.entryHash(e.seq);
      const recomputed = await entryHashOf({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: await sha256Hex(e.payload), ts: e.ts });
      const reasons: AuditReason[] = [];
      if (e.entryHash !== onChain) reasons.push('stored-entry-hash-differs-from-chain');
      if (recomputed !== onChain) reasons.push('recomputed-entry-hash-differs-from-chain');
      if (reasons.length > 0) mismatches.push({ seq: e.seq, reasons });
    }
    if (page.length < PAGE) break;
  }
  // Seqs the registry holds that the ledger has lost, and holes in the ledger below the chain's head.
  const present = new Set<number>();
  if (entries < chainNext - 1) {
    const rows = await db.select({ seq: ledgerEntries.seq }).from(ledgerEntries).where(gt(ledgerEntries.seq, 0));
    for (const r of rows) present.add(r.seq);
    for (let s = 1; s < chainNext; s++) if (!present.has(s)) mismatches.push({ seq: s, reasons: ['on-chain-but-missing-from-ledger'] });
  }
  mismatches.sort((a, b) => a.seq - b.seq);
  return { ok: mismatches.length === 0, chainId: client.chainId, registry: client.registry, entries, compared, pendingNotOnChain, mismatches };
}

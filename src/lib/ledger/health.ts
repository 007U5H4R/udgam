import { access } from 'node:fs/promises';
import { desc } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db } from '../db/client';
import { ledgerCheckpoints, ledgerEntries } from '../db/schema';
import { loadLedgerKey } from './keys';

// The ledger block of GET /api/health (technical-plan §15, TC-001). Server-only.

export type LedgerHealthReport = { lastSeq: number; lastCheckpointAgeSec: number | null; keyPresent: boolean };

export type LedgerHealthOptions = { keyPath?: string; now?: () => Date };

/**
 * Whether the ledger key file is on disk. Loading it first means a fresh install generates the key on
 * its first health probe (first boot); a key file removed later reads as missing even though this
 * process still holds the key in memory.
 */
export async function ledgerKeyPresent(keyPath: string = env.LEDGER_KEY_PATH): Promise<boolean> {
  try {
    await loadLedgerKey(keyPath);
    await access(keyPath);
    return true;
  } catch {
    return false;
  }
}

/** Last ledger seq (0 when empty), whole seconds since the last checkpoint (null if none), key presence. */
export async function ledgerHealth(db: Db, opts: LedgerHealthOptions = {}): Promise<LedgerHealthReport> {
  const keyPresent = await ledgerKeyPresent(opts.keyPath ?? env.LEDGER_KEY_PATH);
  const [head] = await db.select({ seq: ledgerEntries.seq }).from(ledgerEntries).orderBy(desc(ledgerEntries.seq)).limit(1);
  const [cp] = await db.select({ ts: ledgerCheckpoints.ts }).from(ledgerCheckpoints).orderBy(desc(ledgerCheckpoints.id)).limit(1);
  const now = (opts.now ?? (() => new Date()))();
  return {
    lastSeq: head?.seq ?? 0,
    lastCheckpointAgeSec: cp ? Math.max(0, Math.floor((now.getTime() - Date.parse(cp.ts)) / 1000)) : null,
    keyPresent,
  };
}

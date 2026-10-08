import { access } from 'node:fs/promises';
import { asc, desc, gt } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db } from '../db/client';
import { ledgerCheckpoints, ledgerEntries } from '../db/schema';
import { log } from '../log';
import { loadLedgerKey, publishedKeys } from './keys';

// The ledger block of GET /api/health (technical-plan §15, TC-001). Server-only.

export type LedgerHealthReport = {
  lastSeq: number;
  lastCheckpointAgeSec: number | null;
  /**
   * Whole seconds since the oldest entry after the last checkpoint was appended; 0 when everything is
   * sealed or the ledger is empty (EXE55). The uptime probe alerts when it passes 24 h: entries are not
   * being sealed. A quiet day with everything sealed stays 0, however old the last checkpoint is.
   */
  oldestUnsealedAgeSec: number;
  keyPresent: boolean;
  /**
   * A checkpoint was signed by a kid that is not among the published keys: the key that sealed it was
   * lost or replaced, so its certificates fail at `unknown-key` (§8.2). Never silently accepted.
   */
  keyMismatch: boolean;
};

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

/**
 * Checkpoint kids that are not published (the current key's kid is). Logs `ledger.key_mismatch` at
 * error, with kids only, when there are any. Empty when the key cannot be loaded: keyPresent reports that.
 */
async function unpublishedCheckpointKids(db: Db, keyPath: string): Promise<string[]> {
  let published: string[];
  try {
    published = (await publishedKeys(keyPath)).keys.map((k) => k.kid);
  } catch {
    return [];
  }
  const rows = await db.selectDistinct({ kid: ledgerCheckpoints.keyId }).from(ledgerCheckpoints);
  const unknown = rows.map((r) => r.kid).filter((kid) => !published.includes(kid)).sort();
  if (unknown.length > 0) log.error({ kid: published[0], checkpointKids: unknown }, 'ledger.key_mismatch');
  return unknown;
}

/** The oldest entry after `sealedTo` (the last checkpoint's toSeq, 0 if none): one primary-key range read. */
export function oldestUnsealedQuery(db: Db, sealedTo: number) {
  return db.select({ ts: ledgerEntries.ts }).from(ledgerEntries).where(gt(ledgerEntries.seq, sealedTo)).orderBy(asc(ledgerEntries.seq)).limit(1);
}

const ageSec = (now: Date, iso: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000));

/**
 * Last ledger seq (0 when empty), whole seconds since the last checkpoint (null if none), the age of the
 * oldest unsealed entry (0 if none, EXE55), key presence,
 * and whether any checkpoint carries a kid that is not published (keyMismatch).
 */
export async function ledgerHealth(db: Db, opts: LedgerHealthOptions = {}): Promise<LedgerHealthReport> {
  const keyPath = opts.keyPath ?? env.LEDGER_KEY_PATH;
  const keyPresent = await ledgerKeyPresent(keyPath);
  const keyMismatch = (await unpublishedCheckpointKids(db, keyPath)).length > 0;
  const [head] = await db.select({ seq: ledgerEntries.seq }).from(ledgerEntries).orderBy(desc(ledgerEntries.seq)).limit(1);
  const [cp] = await db.select({ ts: ledgerCheckpoints.ts, toSeq: ledgerCheckpoints.toSeq }).from(ledgerCheckpoints).orderBy(desc(ledgerCheckpoints.id)).limit(1);
  const [unsealed] = await oldestUnsealedQuery(db, cp?.toSeq ?? 0);
  const now = (opts.now ?? (() => new Date()))();
  return {
    lastSeq: head?.seq ?? 0,
    lastCheckpointAgeSec: cp ? ageSec(now, cp.ts) : null,
    oldestUnsealedAgeSec: unsealed ? ageSec(now, unsealed.ts) : 0,
    keyPresent,
    keyMismatch,
  };
}

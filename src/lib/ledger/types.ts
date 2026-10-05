import type { Tx } from '../db/client';

/** Ledger entry kinds (technical-plan §8.1). M-002 adds its kinds here. */
export type LedgerKind =
  | 'plot_registered'
  | 'plot_edited'
  | 'device_enrolled'
  | 'device_revoked'
  | 'harvest_event'
  | 'verification_run'
  | 'admin_override'
  | 'attestation'
  | 'batch_created'
  | 'custody_transfer'
  // M-002 contract farming (TKT-25): signed on behalf of the acting user, like custody transfers.
  | 'agreement_created'
  | 'agreement_funded'
  | 'agreement_refunded'
  | 'quality_attestation'
  | 'settlement';

/** Where a provenance row is anchored: its `anchor_seq` and the entry's hashes. */
export type Anchor = { seq: number; entryHash: string; payloadHash: string };

/**
 * A write-transaction handle (`writeTx(db, tx => …)`). The ledger only accepts this, never the
 * database, so an anchor cannot be written outside the transaction that writes its row (§4.3).
 */
export type { Tx };

/** The hashed fields of an entry (§8.1). */
export type EntryHeader = { seq: number; prev_hash: string; kind: string; payload_hash: string; ts: string };

export type ChainCheck = { ok: true } | { ok: false; seq: number; reason: 'seq-gap' | 'prev-hash' | 'payload-hash' | 'entry-hash' };

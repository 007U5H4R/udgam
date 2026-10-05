import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { ledgerEntries } from '../db/schema';
import type { LedgerKind } from './types';

// The provenance closure of a batch (evaluation-plan §4.6, technical-plan §8.3). Server-only.
// Found from the ledger itself, not from provenance tables, so the proof feed covers exactly what the
// anchored payloads say: the batch_created entry lists the member events; each event's
// harvest_event payload names its plot and device. Lookups use the (kind, json_extract) indexes of
// migration 0003.

type Reader = Db | Tx;

type Field = 'batchId' | 'eventId' | 'plotId' | 'deviceId';
// The JSON path is a literal (never a bound parameter) so SQLite can match the expression indexes.
const field = (name: Field): SQL => sql`json_extract(${ledgerEntries.payload}, ${sql.raw(`'$.${name}'`)})`;

async function matching(db: Reader, kinds: LedgerKind[], name: Field, values: string[]) {
  if (values.length === 0) return [];
  return db
    .select({ seq: ledgerEntries.seq, kind: ledgerEntries.kind, payload: ledgerEntries.payload })
    .from(ledgerEntries)
    .where(and(inArray(ledgerEntries.kind, kinds), inArray(field(name), values)));
}

const strings = (xs: unknown[]): string[] => [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.length > 0))];

/** The batch_created entry of `batchId` (the first, if a batch id were ever reused), or undefined. */
export async function batchCreatedEntry(db: Reader, batchId: string) {
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kind, 'batch_created'), eq(field('batchId'), batchId)))
    .orderBy(asc(ledgerEntries.seq))
    .limit(1);
  return row;
}

/**
 * Ledger seqs in the closure of `batchId`, sorted and unique: batch_created; every custody_transfer;
 * every quality_attestation and settlement of the batch (M-002);
 * per member event its harvest_event, all verification_runs and any admin_override; per plot its
 * plot_registered, plot_edited and attestation entries; per device device_enrolled and device_revoked.
 * Empty when the batch does not exist.
 */
export async function closureSeqs(db: Reader, batchId: string): Promise<number[]> {
  const batch = await batchCreatedEntry(db, batchId);
  if (!batch) return [];
  const seqs = new Set<number>([batch.seq]);

  const batchPayload = JSON.parse(batch.payload) as { events?: { eventId?: unknown }[] };
  const eventIds = strings((batchPayload.events ?? []).map((e) => e?.eventId));

  for (const r of await matching(db, ['custody_transfer'], 'batchId', [batchId])) seqs.add(r.seq);
  // M-002 (TKT-25): the buyer's signed grade and every settlement of this batch. The agreement entries
  // themselves stay out: commercial terms are private (Design.md §28.4).
  for (const r of await matching(db, ['quality_attestation', 'settlement'], 'batchId', [batchId])) seqs.add(r.seq);

  const perEvent = await matching(db, ['harvest_event', 'verification_run', 'admin_override'], 'eventId', eventIds);
  const plotIds: unknown[] = [];
  const deviceIds: unknown[] = [];
  for (const r of perEvent) {
    seqs.add(r.seq);
    if (r.kind === 'harvest_event') {
      const p = JSON.parse(r.payload) as { plotId?: unknown; deviceId?: unknown };
      plotIds.push(p.plotId);
      deviceIds.push(p.deviceId);
    }
  }
  for (const r of await matching(db, ['plot_registered', 'plot_edited', 'attestation'], 'plotId', strings(plotIds))) seqs.add(r.seq);
  for (const r of await matching(db, ['device_enrolled', 'device_revoked'], 'deviceId', strings(deviceIds))) seqs.add(r.seq);

  return [...seqs].sort((a, b) => a - b);
}

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { agreements, batches, custodyTransfers, organisations, qualityAttestations, settlements } from '../db/schema';
import { formatKg1, formatInr, istDate } from './format';
import { isGrade, type Grade } from './grades';
import { deliveredBatchIds, type AgreementRow } from './service';
import { judge, settlementFacts, type ConditionResult, type Reason } from './settle';

// What the agreement screens show (Design.md §28.1, §28.7). SERVER-ONLY. Org scope always comes from the
// caller's session: buyer reads filter by buyer_org, FPO reads by fpo_org. Status words and marks follow
// §28.7 "Statuses and their marks": ok = done as agreed; check = something not as agreed; na = waiting
// on someone (including an action the viewer can take). A list row and its detail chip use the same mark.

export type Mark = 'ok' | 'check' | 'na';
export type StatusView = { mark: Mark; word: string; short: string };

export type SettlementView = {
  id: string;
  batchId: string;
  outcome: 'released' | 'not_released';
  reasons: Reason[];
  createdAt: string;
  txHash: string;
  blockNumber: number;
  deliveredKg: number;
  grade: number;
  pickings: number;
  verifiedPickings: number;
};

export type DeliveredBatch = {
  batchId: string;
  shortHash: string;
  deliveredKg: number;
  pickings: number;
  verifiedPickings: number;
  deliveredAt: string;
  grade: Grade | null;
  conditions: ConditionResult[];
};

export type AgreementView = {
  row: AgreementRow;
  buyerName: string;
  fpoName: string;
  delivered: DeliveredBatch[];
  /** Newest first. */
  settlements: SettlementView[];
  deadlinePassed: boolean;
};

const parseReasons = (s: string): Reason[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? (v as Reason[]) : [];
  } catch {
    return [];
  }
};

/** "2 conditions are not met" / "1 condition is not met". */
export const conditionsNotMet = (n: number): string => (n === 1 ? '1 condition not met' : `${n} conditions not met`);

export function buyerStatus(v: AgreementView): StatusView {
  const a = v.row;
  if (a.status === 'settled') return { mark: 'ok', word: 'Payment released', short: 'Payment released' };
  if (a.status === 'refunded') return { mark: 'na', word: 'Refunded', short: 'Refunded' };
  if (a.status === 'created') return { mark: 'na', word: 'Not funded yet', short: 'Not funded yet' };
  if (v.deadlinePassed) return { mark: 'na', word: 'Deadline passed · you can take it back', short: 'Deadline passed · not settled' };
  if (v.delivered.some((b) => b.grade === null)) return { mark: 'na', word: 'Delivered · needs your grade', short: 'Needs your grade' };
  const last = v.settlements[0];
  if (last?.outcome === 'not_released') return { mark: 'check', word: `Not released yet · ${conditionsNotMet(last.reasons.length)}`, short: 'Not released yet' };
  return { mark: 'na', word: 'Funded · waiting for delivery', short: 'Funded · waiting for delivery' };
}

export function adminStatus(v: AgreementView): StatusView {
  const a = v.row;
  if (a.status === 'settled') return { mark: 'ok', word: 'Payment released', short: 'Payment released' };
  if (a.status === 'refunded') return { mark: 'na', word: 'Refunded', short: 'Refunded' };
  if (a.status === 'created') return { mark: 'na', word: 'Buyer hasn’t funded it yet', short: 'Buyer hasn’t funded it yet' };
  if (v.deadlinePassed) return { mark: 'na', word: 'Deadline passed · not settled', short: 'Deadline passed · not settled' };
  const last = v.settlements[0];
  const graded = v.delivered.some((b) => b.grade !== null && !v.settlements.some((s) => s.batchId === b.batchId));
  if (graded) return { mark: 'na', word: 'Ready to settle', short: 'Ready to settle' };
  if (last?.outcome === 'not_released') return { mark: 'check', word: `Not released · ${conditionsNotMet(last.reasons.length)}`, short: 'Not released' };
  if (v.delivered.length > 0) return { mark: 'na', word: 'Delivered · waiting for the buyer’s grade', short: 'Waiting for the buyer’s grade' };
  return { mark: 'na', word: 'Funded · waiting for delivery', short: 'Funded · waiting for delivery' };
}

/** A batch that can still be settled under the agreement: graded, and not yet judged since its grade. */
export function readyBatch(v: AgreementView): DeliveredBatch | null {
  if (v.row.status !== 'funded' || v.deadlinePassed) return null;
  return v.delivered.find((b) => b.grade !== null && !v.settlements.some((s) => s.batchId === b.batchId)) ?? null;
}

/** The batch a buyer grades next: delivered, not graded yet. */
export function batchToGrade(v: AgreementView): DeliveredBatch | null {
  if (v.row.status !== 'funded' || v.deadlinePassed) return null;
  return v.delivered.find((b) => b.grade === null) ?? null;
}

/** One list line: "Arabica · ₹1,50,000.00 · by 31 Dec 2026". */
export function rowFacts(a: AgreementRow): string {
  const crop = a.crop === 'arabica' ? 'Arabica' : 'Robusta';
  const when = a.status === 'settled' && a.closedAt ? istDate(a.closedAt) : a.status === 'refunded' && a.closedAt ? `taken back ${istDate(a.closedAt)}` : `by ${istDate(a.deadline)}`;
  return `${crop} · ${formatInr(a.amountPaise)} · ${when}`;
}

export const kgText = (kg: number): string => `${formatKg1(kg)} kg`;

async function names(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(inArray(organisations.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function view(db: Db, a: AgreementRow, orgNames: Map<string, string>, now: Date): Promise<AgreementView> {
  const ids = await deliveredBatchIds(db, a);
  const delivered: DeliveredBatch[] = [];
  if (ids.length > 0) {
    const meta = await db.select({ id: batches.id, shortHash: batches.shortHash }).from(batches).where(inArray(batches.id, ids));
    const transfers = await db
      .select({ batchId: custodyTransfers.batchId, at: custodyTransfers.transferredAt })
      .from(custodyTransfers)
      .where(and(inArray(custodyTransfers.batchId, ids), eq(custodyTransfers.toOrg, a.buyerOrg)))
      .orderBy(asc(custodyTransfers.transferredAt));
    for (const id of ids) {
      const f = await settlementFacts(db, a.id, id);
      delivered.push({
        batchId: id,
        shortHash: meta.find((m) => m.id === id)?.shortHash ?? '',
        deliveredKg: f.deliveredKg,
        pickings: f.pickings,
        verifiedPickings: f.verifiedPickings,
        deliveredAt: transfers.find((t) => t.batchId === id)?.at ?? '',
        grade: f.grade,
        conditions: judge(f, a),
      });
    }
  }
  const rows = await db.select().from(settlements).where(eq(settlements.agreementId, a.id)).orderBy(desc(settlements.createdAt), desc(settlements.anchorSeq));
  return {
    row: a,
    buyerName: orgNames.get(a.buyerOrg) ?? '',
    fpoName: orgNames.get(a.fpoOrg) ?? '',
    delivered,
    settlements: rows.map((s) => ({ id: s.id, batchId: s.batchId, outcome: s.outcome, reasons: parseReasons(s.reasons), createdAt: s.createdAt, txHash: s.txHash, blockNumber: s.blockNumber, deliveredKg: s.deliveredKg, grade: s.grade, pickings: s.pickings, verifiedPickings: s.verifiedPickings })),
    deadlinePassed: now.getTime() > Date.parse(a.deadline),
  };
}

async function views(db: Db, rows: AgreementRow[], now: Date): Promise<AgreementView[]> {
  const n = await names(db, rows.flatMap((r) => [r.buyerOrg, r.fpoOrg]));
  const out: AgreementView[] = [];
  for (const r of rows) out.push(await view(db, r, n, now));
  return out;
}

/** The buyer organisation's agreements, newest first. */
export async function listBuyerAgreements(db: Db, buyerOrg: string, now: Date = new Date()): Promise<AgreementView[]> {
  return views(db, await db.select().from(agreements).where(eq(agreements.buyerOrg, buyerOrg)).orderBy(desc(agreements.createdAt)), now);
}

/** The FPO's agreements, newest first. */
export async function listFpoAgreements(db: Db, fpoOrg: string, now: Date = new Date()): Promise<AgreementView[]> {
  return views(db, await db.select().from(agreements).where(eq(agreements.fpoOrg, fpoOrg)).orderBy(desc(agreements.createdAt)), now);
}

/** One agreement for `side` of `orgId`, or null (unknown or another organisation's: indistinguishable). */
export async function getAgreementView(db: Db, side: 'buyer' | 'fpo', orgId: string, id: string, now: Date = new Date()): Promise<AgreementView | null> {
  const [row] = await db
    .select()
    .from(agreements)
    .where(and(eq(agreements.id, id), eq(side === 'buyer' ? agreements.buyerOrg : agreements.fpoOrg, orgId)));
  return row ? (await views(db, [row], now))[0]! : null;
}

/** FPO organisations a buyer can agree with. */
export async function listFpoOrgs(db: Db): Promise<{ id: string; name: string }[]> {
  return db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(eq(organisations.type, 'fpo')).orderBy(asc(organisations.name));
}

/** T3: the agreement a batch of this FPO was delivered under (graded or settled under it), or null. */
export async function agreementForBatch(db: Db, fpoOrg: string, batchId: string): Promise<{ agreementId: string; buyerName: string; status: string } | null> {
  const [hit] = await db
    .select({ id: agreements.id, buyerOrg: agreements.buyerOrg, status: agreements.status, closedAt: agreements.closedAt })
    .from(qualityAttestations)
    .innerJoin(agreements, eq(agreements.id, qualityAttestations.agreementId))
    .where(and(eq(qualityAttestations.batchId, batchId), eq(agreements.fpoOrg, fpoOrg)))
    .orderBy(desc(qualityAttestations.createdAt))
    .limit(1);
  if (!hit) return null;
  const n = await names(db, [hit.buyerOrg]);
  const [rel] = await db
    .select({ at: settlements.createdAt, outcome: settlements.outcome })
    .from(settlements)
    .where(and(eq(settlements.agreementId, hit.id), eq(settlements.batchId, batchId)))
    .orderBy(desc(settlements.createdAt))
    .limit(1);
  const status =
    hit.status === 'settled' && rel?.outcome === 'released'
      ? `Payment released · ${istDate(rel.at)}`
      : rel?.outcome === 'not_released'
        ? 'Not released'
        : hit.status === 'refunded'
          ? 'Refunded'
          : 'Ready to settle';
  return { agreementId: hit.id, buyerName: n.get(hit.buyerOrg) ?? '', status };
}

export const gradeOf = (n: number | null): Grade | null => (n !== null && isGrade(n) ? n : null);

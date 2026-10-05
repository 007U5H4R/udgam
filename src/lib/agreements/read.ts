import { and, asc, desc, eq, exists, inArray, notExists, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { agreements, batches, custodyTransfers, organisations, qualityAttestations, settlements } from '../db/schema';
import { t, type MessageKey } from '../i18n';
import { formatKg1, formatInr, istDate } from './format';
import { isGrade, type Grade } from './grades';
import { deliveredBatchIds, type AgreementRow } from './service';
import { judge, settlementFacts, type Condition, type ConditionResult, type Reason } from './settle';

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

const CONDITIONS: readonly Condition[] = ['quantity', 'grade', 'all_verified'];

/**
 * A settlement's reasons as value vs threshold. The row stores condition codes only (the terms are
 * private and stay out of the anchored payload); the texts are rebuilt from the row's observed values
 * and this agreement's terms. Rows written before that change stored `{ condition, text }`: their codes
 * are read the same way.
 */
function reasonsOf(s: typeof settlements.$inferSelect, a: AgreementRow): Reason[] {
  let raw: unknown;
  try {
    raw = JSON.parse(s.reasons);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const codes = raw.map((r: unknown) => (typeof r === 'string' ? r : (r as { condition?: unknown } | null)?.condition)).filter((c): c is Condition => CONDITIONS.includes(c as Condition));
  const results = judge({ deliveredKg: s.deliveredKg, pickings: s.pickings, verifiedPickings: s.verifiedPickings, grade: isGrade(s.grade) ? s.grade : null }, a);
  return results.filter((r) => codes.includes(r.condition)).map((r) => ({ condition: r.condition, text: r.text }));
}

/** "1 condition not met" / "2 conditions not met". */
export const conditionsNotMet = (n: number): string => (n === 1 ? t('agreements.notMetCount.one') : t('agreements.notMetCount.many', { n }));

const sv = (mark: Mark, word: MessageKey, short: MessageKey = word): StatusView => ({ mark, word: t(word), short: t(short) });

export function buyerStatus(v: AgreementView): StatusView {
  const a = v.row;
  if (a.status === 'settled') return sv('ok', 'agreements.status.released');
  if (a.status === 'refunded') return sv('na', 'agreements.status.refunded');
  if (a.status === 'created') return sv('na', 'agreements.status.notFunded');
  if (v.deadlinePassed) return sv('na', 'agreements.status.deadlineTakeBack', 'agreements.status.deadlineNotSettled');
  if (v.delivered.some((b) => b.grade === null)) return sv('na', 'agreements.status.needsGrade', 'agreements.status.needsGradeShort');
  const last = v.settlements[0];
  if (last?.outcome === 'not_released') return { mark: 'check', word: t('agreements.status.notReleasedYetCount', { count: conditionsNotMet(last.reasons.length) }), short: t('agreements.status.notReleasedYet') };
  return sv('na', 'agreements.status.waitingDelivery');
}

export function adminStatus(v: AgreementView): StatusView {
  const a = v.row;
  if (a.status === 'settled') return sv('ok', 'agreements.status.released');
  if (a.status === 'refunded') return sv('na', 'agreements.status.refunded');
  if (a.status === 'created') return sv('na', 'agreements.status.buyerNotFunded');
  if (v.deadlinePassed) return sv('na', 'agreements.status.deadlineNotSettled');
  const last = v.settlements[0];
  const graded = v.delivered.some((b) => b.grade !== null && !v.settlements.some((s) => s.batchId === b.batchId));
  if (graded) return sv('na', 'agreements.status.ready');
  if (last?.outcome === 'not_released') return { mark: 'check', word: t('agreements.status.notReleasedCount', { count: conditionsNotMet(last.reasons.length) }), short: t('agreements.status.notReleased') };
  if (v.delivered.length > 0) return sv('na', 'agreements.status.waitingBuyerGrade', 'agreements.status.waitingBuyerGradeShort');
  return sv('na', 'agreements.status.waitingDelivery');
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
  const crop = t(a.crop === 'arabica' ? 'agreements.row.cropArabica' : 'agreements.row.cropRobusta');
  const when =
    a.status === 'settled' && a.closedAt ? istDate(a.closedAt) : a.status === 'refunded' && a.closedAt ? t('agreements.row.takenBack', { date: istDate(a.closedAt) }) : t('agreements.row.by', { date: istDate(a.deadline) });
  return t('agreements.row.facts', { crop, amount: formatInr(a.amountPaise), when });
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
    settlements: rows.map((s) => ({ id: s.id, batchId: s.batchId, outcome: s.outcome, reasons: reasonsOf(s, a), createdAt: s.createdAt, txHash: s.txHash, blockNumber: s.blockNumber, deliveredKg: s.deliveredKg, grade: s.grade, pickings: s.pickings, verifiedPickings: s.verifiedPickings })),
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

/**
 * T3: the agreement a batch of this FPO was delivered under, or null (Design.md §28 T3: the card appears
 * once the batch is delivered under an agreement). One the batch was graded or settled under comes
 * first; otherwise the newest open (created or funded) agreement the batch counts as delivered under.
 */
export async function agreementForBatch(db: Db, fpoOrg: string, batchId: string): Promise<{ agreementId: string; buyerName: string; status: string } | null> {
  const [graded] = await db
    .select({ id: agreements.id })
    .from(qualityAttestations)
    .innerJoin(agreements, eq(agreements.id, qualityAttestations.agreementId))
    .where(and(eq(qualityAttestations.batchId, batchId), eq(agreements.fpoOrg, fpoOrg)))
    .orderBy(desc(qualityAttestations.createdAt))
    .limit(1);
  let hit: AgreementRow | undefined;
  if (graded) [hit] = await db.select().from(agreements).where(eq(agreements.id, graded.id));
  else {
    // One query (TKT-25 quality review r2): the newest open agreement this batch counts as delivered under,
    // by the same rules as deliveredBatchIds (same FPO and crop, in the buyer's custody, not released
    // under another agreement), evaluated for this one batch.
    [hit] = await db
      .select()
      .from(agreements)
      .where(
        and(
          eq(agreements.fpoOrg, fpoOrg),
          inArray(agreements.status, ['created', 'funded']),
          exists(db.select({ one: sql`1` }).from(batches).where(and(eq(batches.id, batchId), eq(batches.orgId, agreements.fpoOrg), eq(batches.crop, agreements.crop)))),
          exists(db.select({ one: sql`1` }).from(custodyTransfers).where(and(eq(custodyTransfers.batchId, batchId), eq(custodyTransfers.toOrg, agreements.buyerOrg)))),
          notExists(
            db
              .select({ one: sql`1` })
              .from(settlements)
              .where(and(eq(settlements.batchId, batchId), eq(settlements.outcome, 'released'), sql`${settlements.agreementId} <> ${agreements.id}`)),
          ),
        ),
      )
      .orderBy(desc(agreements.createdAt))
      .limit(1);
  }
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
      ? t('agreements.status.releasedOn', { date: istDate(rel.at) })
      : rel?.outcome === 'not_released'
        ? t('agreements.status.notReleased')
        : hit.status === 'refunded'
          ? t('agreements.status.refunded')
          : hit.status === 'created'
            ? t('agreements.status.buyerNotFunded')
            : graded
              ? t('agreements.status.ready')
              : t('agreements.status.waitingGrade');
  return { agreementId: hit.id, buyerName: n.get(hit.buyerOrg) ?? '', status };
}

export const gradeOf = (n: number | null): Grade | null => (n !== null && isGrade(n) ? n : null);

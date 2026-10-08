import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from '../batches/create';
import { transferBatch } from '../custody/transfer';
import { writeTx } from '../db/client';
import { agreements, qualityAttestations, settlements, user } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';

// TSK-25.4: the agreement, attestation and settlement tables are anchored provenance. Every insert
// needs its ledger entry (anchor FK), rows are never replaced or deleted, an agreement's terms are fixed
// and its status only moves created → funded → settled | refunded (migration 0027_agreements_guards).

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-agreements-schema-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let buyerOrg: string;
let buyerUser: string;
let batchId: string;

beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
  const caps = [await seedCapture(t.db, w, { kg: 300 }), await seedCapture(t.db, w, { kg: 312 })];
  ({ batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) }));
  buyerOrg = await seedBuyer(t.db);
  buyerUser = newId('USR-');
  await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@b.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
  await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
});
afterEach(async () => {
  await t.cleanup();
});

const reason = (e: unknown): string => (e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : String(e));
async function refused(p: Promise<unknown>, pattern: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, 'the write should be refused').not.toBeNull();
  expect(reason(err)).toMatch(pattern);
}

const ts = '2026-10-01T06:00:00.000Z';
const anchor = (kind: Parameters<typeof append>[1]) => writeTx(t.db, (tx) => append(tx, kind, { v: 1, n: newId('') }));

async function insertAgreement(id = newId('AG-'), anchorSeq?: number) {
  const seq = anchorSeq ?? (await anchor('agreement_created')).seq;
  await writeTx(t.db, (tx) =>
    tx
      .insert(agreements)
      .values({
        id,
        chainIdHex: `0x${newId('', 64).toLowerCase()}`,
        buyerOrg,
        fpoOrg: w.orgId,
        crop: 'arabica',
        agreedKg: 600,
        minGrade: 70,
        amountPaise: 15_000_000,
        deadline: '2026-12-31T18:29:59.999Z',
        createdBy: buyerUser,
        createdAt: ts,
        createdTxHash: `0x${'a'.repeat(64)}`,
        anchorSeq: seq,
      })
      .then(() => undefined),
  );
  return id;
}

async function fund(id: string) {
  const a = await anchor('agreement_funded');
  await writeTx(t.db, (tx) =>
    tx.update(agreements).set({ status: 'funded', fundedAt: ts, fundedTxHash: `0x${'b'.repeat(64)}`, fundedAnchorSeq: a.seq }).where(eq(agreements.id, id)).then(() => undefined),
  );
}

async function attest(agreementId: string, grade = 80) {
  const a = await anchor('quality_attestation');
  const id = newId('QA-', 12);
  await writeTx(t.db, (tx) =>
    tx
      .insert(qualityAttestations)
      .values({ id, agreementId, batchId, grade, signerOrg: buyerOrg, signerAddress: `0x${'1'.repeat(40)}`, eip712Sig: `0x${'2'.repeat(130)}`, signedBy: buyerUser, createdAt: ts, anchorSeq: a.seq })
      .then(() => undefined),
  );
  return id;
}

async function settle(agreementId: string, attestationId: string, outcome: 'released' | 'not_released', o: { reasons?: string[]; allVerified?: boolean; grade?: number } = {}) {
  const a = await anchor('settlement');
  const id = newId('ST-', 12);
  await writeTx(t.db, (tx) =>
    tx
      .insert(settlements)
      .values({
        id,
        agreementId,
        batchId,
        attestationId,
        deliveredKg: 612,
        pickings: 2,
        verifiedPickings: 2,
        allVerified: o.allVerified ?? true,
        grade: o.grade ?? 80,
        outcome,
        reasons: JSON.stringify(o.reasons ?? (outcome === 'released' ? [] : ['Delivered 598.5 kg of 600.0 kg agreed'])),
        txHash: `0x${'c'.repeat(64)}`,
        blockNumber: 7,
        settledBy: w.adminId,
        createdAt: ts,
        anchorSeq: a.seq,
      })
      .then(() => undefined),
  );
  return { id, seq: a.seq };
}

describe('agreements tables (TSK-25.4)', () => {
  it('each insert without a ledger anchor fails', async () => {
    await refused(insertAgreement(newId('AG-'), 999_999), /FOREIGN KEY/);
    const id = await insertAgreement();
    await fund(id);
    await refused(
      writeTx(t.db, (tx) =>
        tx.insert(qualityAttestations).values({ id: newId('QA-'), agreementId: id, batchId, grade: 80, signerOrg: buyerOrg, signerAddress: '0x1', eip712Sig: '0x2', signedBy: buyerUser, createdAt: ts, anchorSeq: 999_999 }),
      ),
      /FOREIGN KEY/,
    );
    const qa = await attest(id);
    await refused(
      writeTx(t.db, (tx) =>
        tx.insert(settlements).values({
          id: newId('ST-'),
          agreementId: id,
          batchId,
          attestationId: qa,
          deliveredKg: 612,
          pickings: 2,
          verifiedPickings: 2,
          allVerified: true,
          grade: 80,
          outcome: 'released',
          reasons: '[]',
          txHash: '0x',
          blockNumber: 1,
          settledBy: w.adminId,
          createdAt: ts,
          anchorSeq: 999_999,
        }),
      ),
      /FOREIGN KEY/,
    );
  });

  it('an agreement is inserted created, never replaced or deleted, and its terms are fixed', async () => {
    const id = await insertAgreement();
    await refused(insertAgreement(id), /UNIQUE: agreement already exists/);
    await refused(t.client.execute({ sql: 'DELETE FROM agreements WHERE id = ?', args: [id] }), /never deleted/);
    await refused(t.client.execute({ sql: 'UPDATE agreements SET amount_paise = 1 WHERE id = ?', args: [id] }), /terms are fixed/);
    await refused(t.client.execute({ sql: 'UPDATE agreements SET deadline = ? WHERE id = ?', args: ['2030-01-01T00:00:00.000Z', id] }), /terms are fixed/);
    await refused(t.client.execute({ sql: 'UPDATE agreements SET min_grade = 40 WHERE id = ?', args: [id] }), /terms are fixed/);
    const seq = (await anchor('agreement_funded')).seq;
    await refused(
      t.client.execute({
        sql: `INSERT INTO agreements (id, chain_id_hex, buyer_org, fpo_org, crop, agreed_kg, min_grade, amount_paise, deadline, status, created_by, created_at, created_tx_hash, anchor_seq, funded_at, funded_tx_hash, funded_anchor_seq)
              VALUES ('AG-FUNDED01', '0xff', ?, ?, 'arabica', 1, 70, 1, 'x', 'funded', ?, 'x', '0x', ?, 'x', '0x', ?)`,
        args: [buyerOrg, w.orgId, buyerUser, seq, seq],
      }),
      /inserted created/,
    );
  });

  it('grades outside the five-label scale and non-positive terms are refused', async () => {
    const seq = (await anchor('agreement_created')).seq;
    for (const [col, val] of [
      ['min_grade', 85],
      ['min_grade', 255],
      ['amount_paise', 0],
      ['agreed_kg', 0],
    ] as const) {
      const v = { min_grade: 70, amount_paise: 100, agreed_kg: 600, [col]: val };
      await refused(
        t.client.execute({
          sql: `INSERT INTO agreements (id, chain_id_hex, buyer_org, fpo_org, crop, agreed_kg, min_grade, amount_paise, deadline, created_by, created_at, created_tx_hash, anchor_seq)
                VALUES (?, ?, ?, ?, 'arabica', ?, ?, ?, 'x', ?, 'x', '0x', ?)`,
          args: [newId('AG-'), newId('0x', 16), buyerOrg, w.orgId, v.agreed_kg, v.min_grade, v.amount_paise, buyerUser, seq],
        }),
        /CHECK constraint failed/,
      );
    }
  });

  it('status moves only created → funded → settled | refunded, each with its anchor', async () => {
    const id = await insertAgreement();
    // funded needs its anchor columns (CHECK), settled/refunded straight from created are refused
    await refused(t.client.execute({ sql: "UPDATE agreements SET status = 'funded' WHERE id = ?", args: [id] }), /CHECK constraint failed: agreements_funded_check/);
    const closeSeq = (await anchor('agreement_refunded')).seq;
    await refused(
      t.client.execute({ sql: "UPDATE agreements SET status = 'refunded', closed_at = 'x', closed_tx_hash = '0x', closed_anchor_seq = ? WHERE id = ?", args: [closeSeq, id] }),
      /status moves only/,
    );
    await fund(id);
    await refused(t.client.execute({ sql: "UPDATE agreements SET status = 'created', funded_at = NULL, funded_tx_hash = NULL, funded_anchor_seq = NULL WHERE id = ?", args: [id] }), /fixed once set|status moves only/);
    // settled needs a released settlement
    await refused(
      t.client.execute({ sql: "UPDATE agreements SET status = 'settled', closed_at = 'x', closed_tx_hash = '0x', closed_anchor_seq = ? WHERE id = ?", args: [closeSeq, id] }),
      /status moves only/,
    );
    await t.client.execute({ sql: "UPDATE agreements SET status = 'refunded', closed_at = 'x', closed_tx_hash = '0x', closed_anchor_seq = ? WHERE id = ?", args: [closeSeq, id] });
    await refused(t.client.execute({ sql: "UPDATE agreements SET status = 'funded', closed_at = NULL, closed_tx_hash = NULL, closed_anchor_seq = NULL WHERE id = ?", args: [id] }), /fixed once set|status moves only/);
    const [row] = await t.db.select().from(agreements).where(eq(agreements.id, id));
    expect(row!.status).toBe('refunded');
  });

  it('a grade needs a funded agreement and a batch delivered to its buyer; one grade per batch, append-only', async () => {
    const id = await insertAgreement();
    await refused(attest(id), /funded agreement and a batch delivered/);
    await fund(id);
    await refused(attest(id, 85), /CHECK constraint failed/);
    const qa = await attest(id);
    await refused(attest(id), /UNIQUE: a grade already exists/);
    await refused(t.client.execute({ sql: 'UPDATE quality_attestations SET grade = 90 WHERE id = ?', args: [qa] }), /append-only/);
    await refused(t.client.execute({ sql: 'DELETE FROM quality_attestations WHERE id = ?', args: [qa] }), /never deleted/);
  });

  it('a grade for a batch not delivered to the buyer is refused', async () => {
    const other = await seedBuyer(t.db);
    const otherUser = newId('USR-');
    await writeTx(t.db, (tx) => tx.insert(user).values({ id: otherUser, name: 'Other', email: `${otherUser.toLowerCase()}@b.test`, role: 'buyer', orgId: other }).then(() => undefined));
    const seq = (await anchor('agreement_created')).seq;
    const id = newId('AG-');
    await writeTx(t.db, (tx) =>
      tx
        .insert(agreements)
        .values({ id, chainIdHex: '0x01', buyerOrg: other, fpoOrg: w.orgId, crop: 'arabica', agreedKg: 1, minGrade: 70, amountPaise: 1, deadline: 'x', createdBy: otherUser, createdAt: ts, createdTxHash: '0x', anchorSeq: seq })
        .then(() => undefined),
    );
    await fund(id);
    const a = await anchor('quality_attestation');
    await refused(
      writeTx(t.db, (tx) =>
        tx.insert(qualityAttestations).values({ id: newId('QA-'), agreementId: id, batchId, grade: 80, signerOrg: other, signerAddress: '0x1', eip712Sig: '0x2', signedBy: otherUser, createdAt: ts, anchorSeq: a.seq }),
      ),
      /delivered to its buyer/,
    );
  });

  it('settlements are append-only, match their grade and outcome, and release at most once', async () => {
    const id = await insertAgreement();
    await fund(id);
    const qa = await attest(id);
    await refused(settle(id, qa, 'released', { reasons: ['x'] }), /reasons that match the outcome/);
    await refused(settle(id, qa, 'released', { allVerified: false }), /reasons that match the outcome/);
    await refused(settle(id, qa, 'not_released', { reasons: [] }), /reasons that match the outcome/);
    await refused(settle(id, qa, 'released', { grade: 90 }), /its signed grade/);
    const notRel = await settle(id, qa, 'not_released');
    await refused(t.client.execute({ sql: 'UPDATE settlements SET outcome = ? WHERE id = ?', args: ['released', notRel.id] }), /append-only/);
    await refused(t.client.execute({ sql: 'DELETE FROM settlements WHERE id = ?', args: [notRel.id] }), /never deleted/);
    const rel = await settle(id, qa, 'released');
    await t.client.execute({ sql: "UPDATE agreements SET status = 'settled', closed_at = 'x', closed_tx_hash = '0x', closed_anchor_seq = ? WHERE id = ?", args: [rel.seq, id] });
    // a settled agreement takes no further settlement
    await refused(settle(id, qa, 'not_released'), /funded agreement/);
    const n = await t.db.$count(settlements, sql`${settlements.agreementId} = ${id} AND ${settlements.outcome} = 'released'`);
    expect(n).toBe(1);
  });

  it('a batch is released at most once across agreements, and takes no grade once paid out under another (TKT-25 fix)', async () => {
    const a = await insertAgreement();
    const b = await insertAgreement();
    const c = await insertAgreement();
    for (const id of [a, b, c]) await fund(id);
    const qaA = await attest(a);
    const qaB = await attest(b);
    const rel = await settle(a, qaA, 'released');
    await t.client.execute({ sql: "UPDATE agreements SET status = 'settled', closed_at = 'x', closed_tx_hash = '0x', closed_anchor_seq = ? WHERE id = ?", args: [rel.seq, a] });
    // the same batch under another funded agreement, with its own signed grade: refused
    await refused(settle(b, qaB, 'released'), /UNIQUE constraint failed: settlements\.batch_id/);
    // a not-released judgment is still allowed (it pays nothing)
    await settle(b, qaB, 'not_released');
    // a new grade for the paid-out batch under a third agreement: refused
    await refused(attest(c), /not already paid out under another agreement/);
    expect(await t.db.$count(settlements, sql`${settlements.batchId} = ${batchId} AND ${settlements.outcome} = 'released'`)).toBe(1);
  });
});

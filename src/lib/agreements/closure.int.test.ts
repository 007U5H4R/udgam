import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFeed } from '../../../evals/scorers/independent-verifier/src';
import { makeAdminKey, seedBatchWorld, signStatement } from '../../../tests/helpers/batch-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { writeTx } from '../db/client';
import { closureSeqs } from '../ledger/closure';
import { buildFeed } from '../ledger/feed';
import { append } from '../ledger/hashchain';
import { publishedKeys } from '../ledger/keys';
import { SIGNED_KINDS, verifyFeed } from '../ledger/proof';

// TSK-25.4: the M-002 kinds are ledger kinds; a batch's closure (and so its proof feed and certificate)
// carries its quality_attestation and settlement entries, never the agreement's own entries (private
// terms, Design.md §28.4); and both the library verifier and the clean-room checker verify such a feed,
// including the payload signature of every new kind (S6-lib 100 %).

const keyDir = mkdtempSync(join(tmpdir(), 'udgam-agreement-closure-'));
vi.stubEnv('LEDGER_KEY_PATH', join(keyDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(keyDir, { recursive: true, force: true }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

describe('agreement kinds in the closure and the proof feed (TSK-25.4)', () => {
  it('the signed kinds include every contract-farming kind', () => {
    for (const k of ['agreement_created', 'agreement_funded', 'agreement_refunded', 'quality_attestation', 'settlement']) expect(SIGNED_KINDS).toContain(k);
  });

  it("a batch's closure has its grade and settlements but not the agreement entries; both verifiers accept the feed", async () => {
    const w = await seedBatchWorld(t.db, { events: 2, plots: 1, transfer: true });
    const other = await seedBatchWorld(t.db, { events: 1, plots: 1, transfer: true });
    const buyer = await makeAdminKey();
    const admin = w.admin;
    const ts = () => new Date().toISOString();
    const seqs = await writeTx(t.db, async (tx) => {
      const created = await append(tx, 'agreement_created', await signStatement(buyer, { v: 1, agreementId: 'AG-TEST0001', amountPaise: 15_000_000, signedBy: buyer.adminId, ts: ts() }));
      const funded = await append(tx, 'agreement_funded', await signStatement(buyer, { v: 1, agreementId: 'AG-TEST0001', signedBy: buyer.adminId, ts: ts() }));
      const grade = await append(tx, 'quality_attestation', await signStatement(buyer, { v: 1, agreementId: 'AG-TEST0001', batchId: w.batchId, grade: 80, signedBy: buyer.adminId, ts: ts() }));
      const settled = await append(
        tx,
        'settlement',
        await signStatement(admin, { v: 1, agreementId: 'AG-TEST0001', batchId: w.batchId, outcome: 'released', reasons: [], signedBy: admin.adminId, ts: ts() }),
      );
      const noise = await append(tx, 'settlement', await signStatement(admin, { v: 1, agreementId: 'AG-TEST0002', batchId: other.batchId, outcome: 'released', reasons: [], signedBy: admin.adminId, ts: ts() }));
      return { created: created.seq, funded: funded.seq, grade: grade.seq, settled: settled.seq, noise: noise.seq };
    });

    const closure = await closureSeqs(t.db, w.batchId);
    expect(closure).toContain(seqs.grade);
    expect(closure).toContain(seqs.settled);
    expect(closure).not.toContain(seqs.created);
    expect(closure).not.toContain(seqs.funded);
    expect(closure).not.toContain(seqs.noise);

    const feed = await buildFeed(t.db, w.batchId);
    expect(feed).not.toBeNull();
    const kinds = feed!.entries.map((e) => e.kind);
    expect(kinds).toContain('settlement');
    expect(kinds).toContain('quality_attestation');
    const keys = await publishedKeys();
    expect(await verifyFeed(feed, keys.keys)).toMatchObject({ ok: true });
    expect(await checkFeed(JSON.parse(JSON.stringify(feed)), keys)).toMatchObject({ ok: true });
  }, 30_000);

  it('a settlement whose payload signature does not verify fails at payload-signature in both verifiers', async () => {
    const w = await seedBatchWorld(t.db, { events: 1, plots: 1, transfer: true });
    const forged = await makeAdminKey();
    await writeTx(t.db, async (tx) => {
      const signed = await signStatement(forged, { v: 1, agreementId: 'AG-TEST0003', batchId: w.batchId, outcome: 'released', reasons: [], ts: new Date().toISOString() });
      // the payload claims a different outcome than the one signed
      await append(tx, 'settlement', { ...signed, outcome: 'not_released' });
    });
    const feed = await buildFeed(t.db, w.batchId);
    const keys = await publishedKeys();
    expect(await verifyFeed(feed, keys.keys)).toMatchObject({ ok: false, step: 'payload-signature' });
    expect(await checkFeed(JSON.parse(JSON.stringify(feed)), keys)).toMatchObject({ ok: false, failure: { step: 'payload-signature' } });
  }, 30_000);
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { addRun, checksWith, seedReviewCapture } from '../../../tests/helpers/review-world';
import { createBatch } from '../batches/create';
import { writeTx } from '../db/client';
import { adminOverrides, ledgerEntries, verificationRuns } from '../db/schema';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import { CONFIG, CONFIG_HASH } from '../verification/config';
import { ReviewError, refusalFromDb } from './errors';
import { overrideRun } from './override';
import { rerunUnavailable } from './rerun';

// TSK-12.4/12.5 refusals under contention and for batched events (TKT-12 fix round 1). Two admins
// pressing at once: the in-process FIFO and BEGIN IMMEDIATE serialise the writes, exactly one decision
// wins, and the other gets a named 409, re-checked inside the write transaction before anything is signed
// or anchored. A batched event's verdict is frozen in its batch_created entry (EXE16): re-run and override
// both answer 409 `batched`, and the database's batched-run refusal maps to the same code.

const gate = vi.hoisted(() => ({ arrive: null as null | (() => Promise<void>) }));
vi.mock('../auth/signing-keys', async (importOriginal) => {
  const m = await importOriginal<typeof import('../auth/signing-keys')>();
  return {
    ...m,
    // Before the write lock: hold here until every racer has passed its checks outside the lock.
    getUserPublicKey: vi.fn(async (userId: string) => {
      await gate.arrive?.();
      return m.getUserPublicKey(userId);
    }),
    signAsUser: vi.fn(m.signAsUser),
  };
});
const keys = await import('../auth/signing-keys');

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-refusals-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let a: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  a = await seedFpo(t.db);
  vi.mocked(keys.signAsUser).mockClear();
  gate.arrive = null;
});
afterEach(async () => {
  gate.arrive = null;
  await t.cleanup();
});

/** Resolves for everyone once `n` callers have arrived. */
function barrier(n: number): () => Promise<void> {
  let arrived = 0;
  let open!: () => void;
  const all = new Promise<void>((r) => (open = r));
  return () => {
    arrived += 1;
    if (arrived === n) open();
    return all;
  };
}

const CLOUD = 'Satellite view blocked by cloud for ±30 days (demo data)';
const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: CLOUD } });
const REASON = 'Scale photo checked by the office in person';
const provider = (arrive?: () => Promise<void>): RemoteSensingProvider => ({
  name: 'live',
  forestLoss: async () => ({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025, source: 'live' }),
  ndviHistory: async () => ({ months: [], source: 'live' }),
  ndviWindow: async () => {
    await arrive?.();
    return { mean: 0.61, clearObservations: 3, source: 'live' };
  },
});
const counts = async () => ({ overrides: await t.db.$count(adminOverrides), runs: await t.db.$count(verificationRuns), ledger: await t.db.$count(ledgerEntries) });

describe('concurrent decisions on one run', () => {
  it('two overrides at once: exactly one wins; the other is 409 already_decided and signs nothing', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const before = await counts();
    gate.arrive = barrier(2); // both pass every check outside the lock before either takes it
    const results = await Promise.allSettled([
      overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON }),
      overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Rejected', reason: 'Scale photo is of another basket' }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toBeInstanceOf(ReviewError);
    expect(lost[0]!.reason).toMatchObject({ code: 'already_decided', status: 409 });
    // The loser is refused by the re-check inside the write transaction, before it signs a statement.
    expect(keys.signAsUser).toHaveBeenCalledTimes(1);
    expect(await counts()).toEqual({ ...before, overrides: before.overrides + 1, ledger: before.ledger + 1 });
  });

  it('a re-run racing an override: exactly one wins; the other is a 409, never `failed`', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const before = await counts();
    const arrive = barrier(2); // the re-run has asked its provider, the override has passed its checks
    gate.arrive = arrive;
    const results = await Promise.allSettled([
      rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider: provider(arrive) }),
      overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toBeInstanceOf(ReviewError);
    expect(['already_decided', 'not_reviewable']).toContain((lost[0]!.reason as ReviewError).code);
    expect((lost[0]!.reason as ReviewError).status).toBe(409);
    const after = await counts();
    expect(after.ledger).toBe(before.ledger + 1); // one anchored decision or run, never both
    expect(after.overrides + after.runs).toBe(before.overrides + before.runs + 1);
  });
});

describe('a batched event is frozen (EXE16)', () => {
  async function batchedDecided() {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy, kg: 40 });
    await overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON });
    await createBatch(t.db, { orgId: a.orgId, adminId: a.adminId, crop: 'arabica', eventIds: [c.eventId] });
    return c;
  }

  it('re-run and override each answer 409 batched, anchoring nothing', async () => {
    const c = await batchedDecided();
    const before = await counts();
    await expect(rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider: provider() })).rejects.toMatchObject({ code: 'batched', status: 409 });
    await expect(overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Rejected', reason: REASON })).rejects.toMatchObject({
      code: 'batched',
      status: 409,
    });
    expect(await counts()).toEqual(before);
  });

  it("the database's refusals of a batched event's new run and override map to batched", async () => {
    const c = await batchedDecided();
    const newRun = await writeTx(t.db, (tx) =>
      tx
        .insert(verificationRuns)
        .values({
          id: 'VR-RAW-1',
          eventId: c.eventId,
          runNo: 2,
          verdict: 'Rejected',
          score: 10,
          checks: '[]',
          unavailableProviders: '[]',
          configVersion: CONFIG.version,
          configHash: CONFIG_HASH,
          createdAt: new Date().toISOString(),
          anchorSeq: 1,
        })
        .then(() => null),
    ).catch((e: unknown) => e);
    expect(newRun).toBeInstanceOf(Error);
    expect(refusalFromDb(newRun)).toBe('batched');

    const raw = await t.client
      .execute({
        sql: `INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq) VALUES ('AO-RAW', ?, ?, 'Rejected', ?, 'sig', 'kid', ?, 1)`,
        args: [c.runId, a.adminId, REASON, new Date().toISOString()],
      })
      .catch((e: unknown) => e);
    expect(raw).toBeInstanceOf(Error);
    expect(refusalFromDb(raw)).toBe('batched');
  });
});

describe("the database's override refusals map to named codes", () => {
  const rawOverride = (runId: string, reason: string) =>
    t.client
      .execute({
        sql: `INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq) VALUES ('AO-RAW', ?, ?, 'Rejected', ?, 'sig', 'kid', ?, 1)`,
        args: [runId, a.adminId, reason, new Date().toISOString()],
      })
      .catch((e: unknown) => e);

  it('a run that is not Needs Review → not_reviewable; a reason with hidden characters → reason_has_control', async () => {
    const verified = await seedReviewCapture(t.db, a, { checks: checksWith() });
    expect(refusalFromDb(await rawOverride(verified.runId, REASON))).toBe('not_reviewable');
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    expect(refusalFromDb(await rawOverride(c.runId, '\u200B'.repeat(12)))).toBe('reason_has_control');
    expect(refusalFromDb(await rawOverride(c.runId, '\u2800'.repeat(12)))).toBe('reason_has_control'); // a braille blank (TKT-12 r2 N2)
    expect(await t.db.$count(adminOverrides)).toBe(0);
  });

  it('a new run after a hard-failed run of the same event → hard_fail_final (CF-06, TKT-12 r2 N3)', async () => {
    const hard = await seedReviewCapture(t.db, a, { checks: checksWith({ photo_uniqueness: { status: 'fail', hardFail: true } }) });
    const err = await addRun(t.db, hard.eventId, 2, checksWith()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(refusalFromDb(err)).toBe('hard_fail_final');
  });
});

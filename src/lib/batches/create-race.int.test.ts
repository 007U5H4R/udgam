import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { batches, ledgerEntries } from '../db/schema';

// TASK-15 fix round 1 (quality finding 6). In one process writeTx serialises batch creation, but a second
// process (a seed or a CLI) can batch a picking between this process's eligibility read and its member
// insert. The database then refuses the insert (UNIQUE event_id, or the membership trigger). That must
// read as `not_eligible` with everything rolled back, not as a 500. The stale read is simulated by
// making the eligibility query return a picking that is already in a batch.

const stale = vi.hoisted(() => ({ rows: null as null | unknown[] }));
vi.mock('./eligible', async (orig) => {
  const real = await orig<typeof import('./eligible')>();
  return {
    ...real,
    eligibleRows: async (...args: Parameters<typeof real.eligibleRows>) => stale.rows ?? real.eligibleRows(...args),
  };
});

const { BatchError, createBatch } = await import('./create');
const { eligibleRows } = await import('./eligible');

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-create-race-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
  stale.rows = null;
});
afterEach(async () => {
  await t.cleanup();
});

describe('createBatch under a cross-process race', () => {
  it('a picking batched by another writer after the eligibility read → not_eligible, nothing persisted', async () => {
    const a = await seedCapture(t.db, w, { kg: 40 });
    const rows = await eligibleRows(t.db, w.orgId, { eventIds: [a.eventId] }); // what this process read
    await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] }); // the other writer
    const before = { ledger: await t.db.$count(ledgerEntries), batches: await t.db.$count(batches) };

    stale.rows = rows;
    const err = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BatchError);
    expect((err as InstanceType<typeof BatchError>).code).toBe('not_eligible');
    expect({ ledger: await t.db.$count(ledgerEntries), batches: await t.db.$count(batches) }).toEqual(before);
  });
});

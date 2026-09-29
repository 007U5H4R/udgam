import type { InValue } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../helpers/db';

// TC-059, EVAL-077 (technical-plan §4.2, TSK-14.1): the batch invariants hold in the database itself.
// Every violation is attempted in raw SQL, bypassing the app, so none of them can be an app-only check.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  await seed();
});
afterEach(async () => {
  await t.cleanup();
});

const H = (c: string) => c.repeat(64);
const TS = '2026-10-01T00:00:00.000Z';
let nextSeq = 1;

const exec = (sql: string, args: InValue[] = []) => t.client.execute({ sql, args });
const one = async (sql: string, args: InValue[] = []) => (await exec(sql, args)).rows[0]!;

/** A ledger entry to anchor a row on (the anchor FK); returns its seq. */
async function anchor(): Promise<number> {
  const seq = nextSeq++;
  await exec(`INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (?, ?, 'x', '{}', ?, ?, ?)`, [
    seq,
    H('0'),
    H('a'),
    TS,
    seq.toString(16).padStart(64, '0'),
  ]);
  return seq;
}

/** Two FPOs and a buyer; per FPO one farmer with an arabica and a robusta plot; one device. */
async function seed() {
  nextSeq = 1;
  await exec(`INSERT INTO organisations (id, type, name) VALUES ('ORG-A', 'fpo', 'A'), ('ORG-B', 'fpo', 'B'), ('ORG-BUY', 'buyer', 'Buyer')`);
  await exec(`INSERT INTO farmers (id, org_id, name, producer_id) VALUES ('FA-A', 'ORG-A', 'a', 'PR-A'), ('FA-B', 'ORG-B', 'b', 'PR-B')`);
  for (const [id, farmer, crop] of [
    ['PL-A-AR', 'FA-A', 'arabica'],
    ['PL-A-RO', 'FA-A', 'robusta'],
    ['PL-B-AR', 'FA-B', 'arabica'],
  ] as const) {
    await exec(`INSERT INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES (?, ?, ?, '{}', 1, ?, ?, ?)`, [id, farmer, crop, await anchor(), TS, TS]);
  }
  // The phone's agent is a real user (devices.agent_id → user, migration 0008_agent_user_fk).
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('AG-1', 'Agent', 'agent@a.test', 'agent', 'ORG-A')`);
  await exec(`INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{}', 'kid', ?, ?)`, [TS, await anchor()]);
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('AD-1', 'Admin', 'admin@a.test', 'admin', 'ORG-A')`);
}

/** An accepted event on `plot` with one verification run per verdict in `runs` (the last one sets final_verdict). */
async function event(id: string, plot: string, kg: number, runs: [verdict: string, score: number][]) {
  await exec(
    `INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, anchor_seq)
     VALUES (?, ?, 'DV-1', 'AG-1', 1, ?, ?, '{}', ?, 'sig', 'accepted', ?)`,
    [id, plot, TS, kg, H(id.slice(-1)), await anchor()],
  );
  for (const [i, [verdict, score]] of runs.entries()) {
    await exec(
      `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
       VALUES (?, ?, ?, ?, ?, '[]', '[]', 'cfg-1', ?, ?, ?)`,
      [`VR-${id}-${i + 1}`, id, i + 1, verdict, score, H('f'), TS, await anchor()],
    );
  }
}

async function batch(id: string, org = 'ORG-A', crop = 'arabica') {
  await exec(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [id, org, crop, 'abcdef012345', await anchor(), TS]);
}

const member = (batchId: string, eventId: string) => exec(`INSERT INTO batch_events (batch_id, event_id) VALUES (?, ?)`, [batchId, eventId]);

async function custody(batchId: string, from = 'ORG-A', to = 'ORG-BUY') {
  await exec(
    `INSERT INTO custody_transfers (id, batch_id, from_org, to_org, admin_id, transferred_at, signature, key_id, anchor_seq) VALUES (?, ?, ?, ?, 'AD-1', ?, 'sig', 'kid', ?)`,
    [`CT-${batchId}-${nextSeq}`, batchId, from, to, TS, await anchor()],
  );
}

const aggregates = (batchId: string) => one(`SELECT quantity_kg, integrity_score, status FROM batches WHERE id = ?`, [batchId]);

describe('batch membership (TC-059, EVAL-077, CF-07)', () => {
  it('an event can be in at most one batch (UNIQUE event_id)', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await batch('B-1');
    await batch('B-2');
    await member('B-1', 'HE-1');
    await expect(member('B-2', 'HE-1')).rejects.toThrow(/UNIQUE/i);
    await expect(member('B-1', 'HE-1')).rejects.toThrow(/UNIQUE/i);
  });

  it('refuses an event whose final verdict is not Verified', async () => {
    await event('HE-2', 'PL-A-AR', 40, [['Needs Review', 70]]);
    await event('HE-3', 'PL-A-AR', 40, [['Rejected', 20]]);
    await event('HE-4', 'PL-A-AR', 40, []);
    await batch('B-1');
    for (const id of ['HE-2', 'HE-3', 'HE-4']) await expect(member('B-1', id), id).rejects.toThrow(/not Verified/);
    expect(Number((await one(`SELECT COUNT(*) AS n FROM batch_events`)).n)).toBe(0);
  });

  it('uses the final verdict: a later Verified run makes an event eligible, a later Needs Review run does not', async () => {
    await event('HE-5', 'PL-A-AR', 40, [['Needs Review', 70], ['Verified', 88]]);
    await event('HE-6', 'PL-A-AR', 40, [['Verified', 90], ['Needs Review', 72]]);
    await batch('B-1');
    await member('B-1', 'HE-5');
    await expect(member('B-1', 'HE-6')).rejects.toThrow(/not Verified/);
  });

  it('refuses a robusta event in an arabica batch', async () => {
    await event('HE-7', 'PL-A-RO', 40, [['Verified', 91]]);
    await batch('B-1', 'ORG-A', 'arabica');
    await expect(member('B-1', 'HE-7')).rejects.toThrow(/crop/);
  });

  it("refuses another organisation's event", async () => {
    await event('HE-8', 'PL-B-AR', 40, [['Verified', 91]]);
    await batch('B-1', 'ORG-A');
    await expect(member('B-1', 'HE-8')).rejects.toThrow(/organisation/);
  });

  it('refuses an unknown batch or event', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await batch('B-1');
    await expect(member('B-NOPE', 'HE-1')).rejects.toThrow();
    await expect(member('B-1', 'HE-NOPE')).rejects.toThrow();
  });

  it('a batch is born open and empty, anchored in the ledger', async () => {
    await expect(exec(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-9', 'ORG-A', 'arabica', 'x', 999, ?)`, [TS])).rejects.toThrow(/FOREIGN KEY/i);
    const seq = await anchor();
    for (const [col, value] of [
      ['status', "'transferred'"],
      ['quantity_kg', '5'],
      ['integrity_score', '90'],
    ] as const) {
      await expect(
        exec(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at, ${col}) VALUES ('B-9', 'ORG-A', 'arabica', 'x', ?, ?, ${value})`, [seq, TS]),
        col,
      ).rejects.toThrow(/open and empty/);
    }
    await expect(exec(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-9', 'ORG-A', 'coffee', 'x', ?, ?)`, [seq, TS])).rejects.toThrow(/CHECK/i);
  });
});

describe('batch aggregates (TC-059, EVAL-077)', () => {
  it('quantity_kg = Σ cherry_kg and integrity_score = MIN(score of the run that set final_verdict), after each insert', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91.5]]);
    await event('HE-2', 'PL-A-AR', 42.5, [['Needs Review', 60], ['Verified', 84]]); // the latest run's score counts
    await event('HE-3', 'PL-A-AR', 46, [['Verified', 97]]);
    await batch('B-1');
    expect(await aggregates('B-1')).toMatchObject({ quantity_kg: 0, integrity_score: null, status: 'open' });
    await member('B-1', 'HE-1');
    expect(await aggregates('B-1')).toMatchObject({ quantity_kg: 40, integrity_score: 91.5 });
    await member('B-1', 'HE-2');
    expect(await aggregates('B-1')).toMatchObject({ quantity_kg: 82.5, integrity_score: 84 });
    await member('B-1', 'HE-3');
    expect(await aggregates('B-1')).toMatchObject({ quantity_kg: 128.5, integrity_score: 84 });
  });

  it('the aggregate columns cannot be written directly', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await batch('B-1');
    await member('B-1', 'HE-1');
    await expect(exec(`UPDATE batches SET quantity_kg = 999 WHERE id = 'B-1'`)).rejects.toThrow(/maintained by the database/);
    await expect(exec(`UPDATE batches SET integrity_score = 100 WHERE id = 'B-1'`)).rejects.toThrow(/maintained by the database/);
    expect(await aggregates('B-1')).toMatchObject({ quantity_kg: 40, integrity_score: 91 });
  });

  it("a batch's identity (org, crop, short hash, anchor) never changes, and batches are never deleted", async () => {
    await batch('B-1');
    for (const set of [`org_id = 'ORG-B'`, `crop = 'robusta'`, `short_hash = 'zzz'`, `anchor_seq = 1`, `id = 'B-X'`]) {
      await expect(exec(`UPDATE batches SET ${set} WHERE id = 'B-1'`), set).rejects.toThrow(/cannot change/);
    }
    await expect(exec(`DELETE FROM batches WHERE id = 'B-1'`)).rejects.toThrow(/never deleted/);
  });

  it("a batched event's verdict is frozen: no new verification run", async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await batch('B-1');
    await member('B-1', 'HE-1');
    await expect(
      exec(
        `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
         VALUES ('VR-X', 'HE-1', 2, 'Needs Review', 60, '[]', '[]', 'cfg-1', ?, ?, ?)`,
        [H('f'), TS, await anchor()],
      ),
    ).rejects.toThrow(/frozen/);
    expect(await aggregates('B-1')).toMatchObject({ integrity_score: 91 });
  });

  it('membership is fixed: a member cannot be removed from an open batch', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await batch('B-1');
    await member('B-1', 'HE-1');
    await expect(exec(`DELETE FROM batch_events WHERE event_id = 'HE-1'`)).rejects.toThrow(/fixed/);
    await expect(exec(`UPDATE batch_events SET batch_id = 'B-1' WHERE event_id = 'HE-1'`)).rejects.toThrow(/fixed/);
  });
});

describe('lock after transfer (TC-059, TC-060, EVAL-077)', () => {
  it("status='transferred' needs a custody_transfers row", async () => {
    await batch('B-1');
    await expect(exec(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`)).rejects.toThrow(/custody/);
    expect((await aggregates('B-1')).status).toBe('open');
  });

  it('with a custody row the status change succeeds once; afterwards the batch and its members are locked', async () => {
    await event('HE-1', 'PL-A-AR', 40, [['Verified', 91]]);
    await event('HE-2', 'PL-A-AR', 42.5, [['Verified', 93]]);
    await batch('B-1');
    await member('B-1', 'HE-1');
    await custody('B-1');
    await exec(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`);
    expect(await aggregates('B-1')).toMatchObject({ status: 'transferred', quantity_kg: 40, integrity_score: 91 });

    await expect(exec(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`)).rejects.toThrow(/locked after transfer/);
    await expect(exec(`UPDATE batches SET status = 'open' WHERE id = 'B-1'`)).rejects.toThrow(/locked after transfer/);
    await expect(member('B-1', 'HE-2')).rejects.toThrow(/locked after transfer/);
    await expect(exec(`DELETE FROM batch_events WHERE batch_id = 'B-1'`)).rejects.toThrow(/locked after transfer/);
    expect(Number((await one(`SELECT COUNT(*) AS n FROM batch_events WHERE batch_id = 'B-1'`)).n)).toBe(1);
  });

  it('custody is recorded only for an open batch, from the organisation that holds it, and is never changed', async () => {
    await batch('B-1');
    await expect(custody('B-1', 'ORG-B')).rejects.toThrow(/holds/);
    await custody('B-1');
    await exec(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`);
    await expect(custody('B-1', 'ORG-BUY', 'ORG-B')).rejects.toThrow(/not open/);
    await expect(exec(`UPDATE custody_transfers SET to_org = 'ORG-B'`)).rejects.toThrow(/append-only/);
    await expect(exec(`DELETE FROM custody_transfers`)).rejects.toThrow(/append-only/);
  });

  it('declares anchor_seq NOT NULL REFERENCES ledger_entries(seq) on batches and custody_transfers', async () => {
    for (const table of ['batches', 'custody_transfers']) {
      const fks = await exec(`PRAGMA foreign_key_list(${table})`);
      expect(fks.rows.find((r) => r.from === 'anchor_seq'), table).toMatchObject({ table: 'ledger_entries', to: 'seq' });
      const cols = await exec(`PRAGMA table_info(${table})`);
      expect(cols.rows.find((r) => r.name === 'anchor_seq')?.notnull, table).toBe(1);
    }
  });
});

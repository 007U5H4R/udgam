import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { runMigrations } from './migrate';

// technical-plan §4.2 invariants, attempted directly in SQL (TC-008 append-only part, TC-010(b)).
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const H = (c: string) => c.repeat(64);

async function ledgerRow(seq: number) {
  await t.client.execute({
    sql: `INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (?, ?, 'harvest_event', '{}', ?, '2026-10-01T00:00:00.000Z', ?)`,
    args: [seq, H('0'), H('a'), H(String(seq % 10))],
  });
}

async function eventRow(id: string, anchorSeq: number, over: Record<string, unknown> = {}) {
  const row = {
    id,
    plot_id: 'PL-1',
    device_id: null,
    agent_id: null,
    server_received_at: '2026-10-01T00:00:00.000Z',
    payload: '{}',
    payload_hash: H(id.slice(-1)),
    signature: 'sig',
    boundary_status: 'rejected',
    boundary_reason: 'bad_signature',
    anchor_seq: anchorSeq,
    ...over,
  };
  const cols = Object.keys(row);
  await t.client.execute({
    sql: `INSERT INTO harvest_events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    args: Object.values(row) as (string | number | null)[],
  });
}

describe('ledger_entries is append-only (TC-008)', () => {
  it('aborts a raw UPDATE with "ledger is append-only"', async () => {
    await ledgerRow(1);
    await expect(t.client.execute(`UPDATE ledger_entries SET kind = 'x' WHERE seq = 1`)).rejects.toThrow(
      'ledger is append-only',
    );
  });

  it('aborts a raw DELETE with "ledger is append-only"', async () => {
    await ledgerRow(1);
    await expect(t.client.execute(`DELETE FROM ledger_entries WHERE seq = 1`)).rejects.toThrow('ledger is append-only');
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n).toBe(1);
  });

  it('refuses a duplicate seq (seq is the primary key)', async () => {
    await ledgerRow(1);
    await expect(
      t.client.execute(
        `INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (1, '${H('0')}', 'harvest_event', '{}', '${H('b')}', 'x', '${H('c')}')`,
      ),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('anchor foreign keys (TC-010 b, CF-08)', () => {
  it('refuses a harvest_events row whose anchor_seq does not exist', async () => {
    await expect(eventRow('HE-1', 999)).rejects.toThrow(/FOREIGN KEY/i);
    await ledgerRow(1);
    await expect(eventRow('HE-1', 1)).resolves.toBeUndefined();
  });

  it('declares anchor_seq NOT NULL REFERENCES ledger_entries(seq) on every provenance table in this slice', async () => {
    for (const table of ['plots', 'devices', 'harvest_events', 'verification_runs']) {
      const fks = await t.client.execute(`PRAGMA foreign_key_list(${table})`);
      const anchor = fks.rows.find((r) => r.from === 'anchor_seq');
      expect(anchor, table).toMatchObject({ table: 'ledger_entries', to: 'seq' });
      const cols = await t.client.execute(`PRAGMA table_info(${table})`);
      expect(cols.rows.find((r) => r.name === 'anchor_seq')?.notnull, table).toBe(1);
    }
  });

  it('refuses an accepted harvest event without a device', async () => {
    await ledgerRow(1);
    await expect(eventRow('HE-2', 1, { boundary_status: 'accepted', boundary_reason: null })).rejects.toThrow(/CHECK/i);
  });

  it('refuses a second event with the same payload_hash', async () => {
    await ledgerRow(1);
    await eventRow('HE-1', 1);
    await expect(eventRow('HE-2', 1, { payload_hash: H('1') })).rejects.toThrow(/UNIQUE/i);
  });
});

describe('migrations', () => {
  it('apply idempotently from the working-directory path used at boot', async () => {
    await expect(runMigrations(t.db)).resolves.toBeUndefined();
    const triggers = await t.client.execute(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`);
    // Later tickets add their own triggers; these are TKT-02's.
    expect(triggers.rows.map((r) => r.name)).toEqual(expect.arrayContaining(['ledger_no_delete', 'ledger_no_update', 'runs_set_final_verdict']));
  });
});

describe('final verdict trigger (§4.2)', () => {
  it('inserting a verification run sets harvest_events.final_verdict', async () => {
    await ledgerRow(1);
    await eventRow('HE-1', 1);
    await ledgerRow(2);
    await t.client.execute({
      sql: `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
            VALUES ('VR-1', 'HE-1', 1, 'Needs Review', 91.7, '[]', '[]', 'cfg-1', ?, '2026-10-01T00:00:00.000Z', 2)`,
      args: [H('f')],
    });
    const row = (await t.client.execute(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).rows[0];
    expect(row?.final_verdict).toBe('Needs Review');
  });

  it('refuses a second run with the same run_no for one event', async () => {
    await ledgerRow(1);
    await eventRow('HE-1', 1);
    const insert = (id: string) =>
      t.client.execute({
        sql: `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
              VALUES (?, 'HE-1', 1, 'Verified', 100, '[]', '[]', 'cfg-1', ?, 'x', 1)`,
        args: [id, H('f')],
      });
    await insert('VR-1');
    await expect(insert('VR-2')).rejects.toThrow(/UNIQUE/i);
  });
});

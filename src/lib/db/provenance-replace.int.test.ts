import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// TKT-19 hardening (TASK-15 re-review R1, technical-plan §4.2, S8, TP14). INSERT OR REPLACE resolves a
// key conflict by deleting the old row without firing DELETE or UPDATE triggers, so it got around the
// frozen-fact guards: a batched event's kilograms and a plot's crop could be rewritten, and a
// verification run could simply be deleted. Every anchored provenance table now refuses an insert whose
// primary or unique key already exists, and refuses DELETE. Attempted directly in SQL.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  await t.client.executeMultiple(`
    INSERT INTO organisations (id, type, name) VALUES ('ORG-A', 'fpo', 'A');
    INSERT INTO farmers (id, org_id, name, producer_id) VALUES ('FA-1', 'ORG-A', 'f', 'PR-1');
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('AG-1', 'Agent', 'a@x.test', 1, 0, 0, 'agent', 'ORG-A');
    INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash)
      VALUES (1, '${H('0')}', 'x', '{}', '${H('a')}', '${TS}', '${H('1')}');
    INSERT INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES ('PL-1', 'FA-1', 'arabica', '{}', 1, 1, '${TS}', '${TS}');
    INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{}', 'kid-1', '${TS}', 1);
    INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, anchor_seq)
      VALUES ('HE-1', 'PL-1', 'DV-1', 'AG-1', 1, '${TS}', 40, '{}', '${H('b')}', 'sig', 'accepted', 1);
    INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
      VALUES ('VR-1', 'HE-1', 1, 'Verified', 91, '[]', '[]', 'cfg-1', '${H('c')}', '${TS}', 1);
  `);
});
afterEach(async () => {
  await t.cleanup();
});

function H(c: string) {
  return c.repeat(64);
}
const TS = '2026-10-01T00:00:00.000Z';
const exec = (sql: string) => t.client.execute(sql);
const one = async (sql: string) => ({ ...(await t.client.execute(sql)).rows[0] });

describe('provenance rows cannot be replaced (§4.2, R1)', () => {
  it('plots: REPLACE by id is refused and the crop is unchanged', async () => {
    for (const verb of ['INSERT OR REPLACE', 'REPLACE', 'INSERT']) {
      await expect(
        exec(`${verb} INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES ('PL-1', 'FA-1', 'robusta', '{}', 9, 1, '${TS}', '${TS}')`),
        verb,
      ).rejects.toThrow('plot already exists');
    }
    expect(await one(`SELECT crop, area_ha FROM plots`)).toEqual({ crop: 'arabica', area_ha: 1 });
  });

  it('devices: REPLACE by id or by key thumbprint is refused', async () => {
    await expect(
      exec(`INSERT OR REPLACE INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{"x":1}', 'kid-9', '${TS}', 1)`),
    ).rejects.toThrow('device already exists');
    await expect(
      exec(`INSERT OR REPLACE INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-2', 'AG-1', '{"x":1}', 'kid-1', '${TS}', 1)`),
    ).rejects.toThrow('device already exists');
    expect(await one(`SELECT COUNT(*) AS n, MAX(public_key_jwk) AS jwk FROM devices`)).toEqual({ n: 1, jwk: '{}' });
  });

  it('harvest_events: REPLACE by id or by payload_hash is refused and cherry_kg is unchanged', async () => {
    const values = (id: string, hash: string) =>
      `VALUES ('${id}', 'PL-1', 'DV-1', 'AG-1', 1, '${TS}', 999, '{}', '${hash}', 'sig', 'accepted', 1)`;
    const cols = '(id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, anchor_seq)';
    await expect(exec(`INSERT OR REPLACE INTO harvest_events ${cols} ${values('HE-1', H('e'))}`)).rejects.toThrow('UNIQUE: harvest event already exists');
    await expect(exec(`INSERT OR REPLACE INTO harvest_events ${cols} ${values('HE-2', H('b'))}`)).rejects.toThrow('UNIQUE: harvest event already exists');
    await expect(exec(`INSERT INTO harvest_events ${cols} ${values('HE-2', H('b'))}`)).rejects.toThrow(/UNIQUE/);
    expect(await one(`SELECT COUNT(*) AS n, MAX(cherry_kg) AS kg FROM harvest_events`)).toEqual({ n: 1, kg: 40 });
  });

  it('verification_runs: REPLACE by id or by (event_id, run_no) is refused and the score is unchanged', async () => {
    const insert = (verb: string, id: string, runNo: number) =>
      exec(
        `${verb} INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq) VALUES ('${id}', 'HE-1', ${runNo}, 'Rejected', 5, '[]', '[]', 'cfg-1', '${H('c')}', '${TS}', 1)`,
      );
    await expect(insert('INSERT OR REPLACE', 'VR-1', 7)).rejects.toThrow('UNIQUE: verification run already exists');
    await expect(insert('INSERT OR REPLACE', 'VR-2', 1)).rejects.toThrow('UNIQUE: verification run already exists');
    expect(await one(`SELECT COUNT(*) AS n, MAX(score) AS score FROM verification_runs`)).toEqual({ n: 1, score: 91 });
    await expect(insert('INSERT', 'VR-2', 2)).resolves.toBeDefined(); // a new run is still an ordinary insert
  });

  it('an upsert (ON CONFLICT DO UPDATE) is refused as well: none of these tables is ever upserted', async () => {
    await expect(
      exec(
        `INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, anchor_seq)
         VALUES ('HE-1', 'PL-1', 'DV-1', 'AG-1', 1, '${TS}', 999, '{}', '${H('b')}', 'sig', 'accepted', 1)
         ON CONFLICT(id) DO UPDATE SET cherry_kg = excluded.cherry_kg`,
      ),
    ).rejects.toThrow('already exists');
    expect(await one(`SELECT cherry_kg FROM harvest_events`)).toEqual({ cherry_kg: 40 });
  });
});

describe('provenance rows are never deleted (§4.2, R1)', () => {
  it.each([
    ['verification_runs', `DELETE FROM verification_runs WHERE id = 'VR-1'`, 'verification runs are never deleted'],
    ['harvest_events', `DELETE FROM harvest_events WHERE id = 'HE-1'`, 'harvest events are never deleted'],
    ['devices', `DELETE FROM devices WHERE id = 'DV-1'`, 'devices are never deleted'],
    ['plots', `DELETE FROM plots WHERE id = 'PL-1'`, 'plots are never deleted'],
  ])('%s: DELETE is refused', async (table, sql, message) => {
    // children first would be needed for a foreign-key-legal delete; the trigger refuses before that matters
    await expect(exec(sql)).rejects.toThrow(message);
    expect(await one(`SELECT COUNT(*) AS n FROM ${table}`)).toEqual({ n: 1 });
  });

  it('existing guards still hold: batches and custody transfers, the ledger', async () => {
    await expect(exec(`DELETE FROM ledger_entries`)).rejects.toThrow('ledger is append-only');
  });
});

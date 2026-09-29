import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// devices.agent_id and harvest_events.agent_id → user(id) (TKT-19 carry-forward; migration
// 0009_agent_user_fk). Attempted directly in SQL, as the §4.2 invariants are.
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  await t.client.executeMultiple(`
    INSERT INTO organisations (id, type, name) VALUES ('ORG-1', 'fpo', 'FPO');
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id)
      VALUES ('U-1', 'Agent', 'a@x.test', 1, 0, 0, 'agent', 'ORG-1');
    INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash)
      VALUES (1, '${'0'.repeat(64)}', 'device_enrolled', '{}', '${'a'.repeat(64)}', '2026-10-01T00:00:00.000Z', '${'1'.repeat(64)}');
  `);
});
afterEach(async () => {
  await t.cleanup();
});

const device = (id: string, agent: string) =>
  t.client.execute({
    sql: `INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES (?, ?, '{}', ?, '2026-10-01T00:00:00.000Z', 1)`,
    args: [id, agent, `kt-${id}`],
  });
const event = (id: string, agent: string | null) =>
  t.client.execute({
    sql: `INSERT INTO harvest_events (id, agent_id, server_received_at, payload, payload_hash, signature, boundary_status, boundary_reason, anchor_seq)
          VALUES (?, ?, '2026-10-01T00:00:00.000Z', '{}', ?, 'sig', 'rejected', 'media_type', 1)`,
    args: [id, agent, `ph-${id}`],
  });

describe('agent foreign keys', () => {
  it('a phone must belong to an existing user', async () => {
    await expect(device('DV-1', 'U-1')).resolves.toBeDefined();
    await expect(device('DV-2', 'U-nobody')).rejects.toThrow('FOREIGN KEY constraint failed: devices.agent_id');
    await expect(t.client.execute(`UPDATE devices SET agent_id = 'U-nobody' WHERE id = 'DV-1'`)).rejects.toThrow('FOREIGN KEY');
  });

  it('a capture names an existing user, or no one', async () => {
    await expect(event('HE-1', 'U-1')).resolves.toBeDefined();
    await expect(event('HE-2', null)).resolves.toBeDefined();
    await expect(event('HE-3', 'U-nobody')).rejects.toThrow('FOREIGN KEY constraint failed: harvest_events.agent_id');
    await expect(t.client.execute(`UPDATE harvest_events SET agent_id = 'U-nobody' WHERE id = 'HE-2'`)).rejects.toThrow('FOREIGN KEY');
  });

  it('a user named by a phone or a capture cannot be deleted or re-keyed; an unreferenced one can', async () => {
    await device('DV-1', 'U-1');
    await expect(t.client.execute(`DELETE FROM user WHERE id = 'U-1'`)).rejects.toThrow('FOREIGN KEY');
    await expect(t.client.execute(`UPDATE user SET id = 'U-9' WHERE id = 'U-1'`)).rejects.toThrow('FOREIGN KEY');
    await t.client.execute(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('U-2', 'B', 'b@x.test', 1, 0, 0, 'agent', 'ORG-1')`);
    await event('HE-1', 'U-2');
    await expect(t.client.execute(`DELETE FROM user WHERE id = 'U-2'`)).rejects.toThrow('FOREIGN KEY');
    await t.client.execute(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('U-3', 'C', 'c@x.test', 1, 0, 0, 'agent', 'ORG-1')`);
    await expect(t.client.execute(`DELETE FROM user WHERE id = 'U-3'`)).resolves.toBeDefined();
  });

  // TASK-20 fix round 2 (review #9; migration 0016_user_replace_guard). INSERT OR REPLACE resolves a
  // conflict by deleting the old row, and with recursive_triggers off no DELETE trigger fires, so the
  // guard above never saw it. A real foreign key would still refuse: the referenced id would be gone.
  const insertUser = (verb: string, id: string, email: string, tail = '') =>
    t.client.execute(
      `${verb} INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('${id}', 'N', '${email}', 1, 0, 0, 'agent', 'ORG-1')${tail}`,
    );
  const userIds = async () => (await t.client.execute(`SELECT id FROM user ORDER BY id`)).rows.map((r) => r.id);

  it('a referenced user cannot be replaced away through an email conflict (INSERT OR REPLACE / REPLACE)', async () => {
    await device('DV-1', 'U-1');
    await expect(insertUser('INSERT OR REPLACE', 'U-9', 'a@x.test')).rejects.toThrow('FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
    await expect(insertUser('REPLACE', 'U-9', 'a@x.test')).rejects.toThrow('FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
    expect(await userIds()).toEqual(['U-1']);
  });

  it('a user named only by a capture is guarded too', async () => {
    await insertUser('INSERT', 'U-2', 'b@x.test');
    await event('HE-1', 'U-2');
    await expect(insertUser('INSERT OR REPLACE', 'U-8', 'b@x.test')).rejects.toThrow('FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
    expect(await userIds()).toEqual(['U-1', 'U-2']);
  });

  it('what a foreign key allows stays allowed: replacing the same id, replacing an unreferenced user, the seed upsert', async () => {
    await device('DV-1', 'U-1');
    // Same id: the referencing rows still name an existing user afterwards.
    await expect(insertUser('INSERT OR REPLACE', 'U-1', 'a@x.test')).resolves.toBeDefined();
    // An unreferenced user may be replaced through its email, as a FK would allow.
    await insertUser('INSERT', 'U-3', 'c@x.test');
    await expect(insertUser('INSERT OR REPLACE', 'U-7', 'c@x.test')).resolves.toBeDefined();
    // scripts/seed-accounts.ts upserts on id; that path never deletes a row.
    await expect(insertUser('INSERT', 'U-1', 'a@x.test', ` ON CONFLICT (id) DO UPDATE SET name = 'Renamed'`)).resolves.toBeDefined();
    expect(await userIds()).toEqual(['U-1', 'U-7']);
    expect((await t.client.execute(`SELECT name FROM user WHERE id = 'U-1'`)).rows[0]?.name).toBe('Renamed');
    expect((await t.client.execute(`SELECT count(*) AS n FROM devices WHERE agent_id = 'U-1'`)).rows[0]?.n).toBe(1);
  });
});

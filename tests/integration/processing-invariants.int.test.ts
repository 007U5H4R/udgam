import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InValue } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { tempDb, type TempDb } from '../helpers/db';

// TSK-26.3 (TC-086, F18, D9): the processor hop's invariants hold in the database itself, attempted in
// raw SQL. Custody goes FPO → processor → buyer (only the holder hands on; a processor only to a buyer;
// a batch a buyer holds stays locked). A processing step is recorded only by the processor organisation
// that holds the batch, only with a processing_step anchor, and never changes. The `user` rebuild that
// adds the processor role keeps every row and restores the triggers on and around `user`.

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

async function anchor(kind = 'x'): Promise<number> {
  const seq = nextSeq++;
  await exec(`INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (?, ?, ?, '{}', ?, ?, ?)`, [
    seq,
    H('0'),
    kind,
    H('a'),
    TS,
    seq.toString(16).padStart(64, '0'),
  ]);
  return seq;
}

async function seed() {
  nextSeq = 1;
  await exec(
    `INSERT INTO organisations (id, type, name) VALUES ('ORG-A', 'fpo', 'A'), ('ORG-BUY', 'buyer', 'Buyer'), ('ORG-BUY2', 'buyer', 'Buyer 2'), ('ORG-P', 'processor', 'Processor C-03'), ('ORG-P2', 'processor', 'Processor 2')`,
  );
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('AD-1', 'Admin', 'admin@a.test', 'admin', 'ORG-A')`);
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('PU-1', 'Ravi', 'ravi@p.test', 'processor', 'ORG-P')`);
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('PU-2', 'Asha', 'asha@p2.test', 'processor', 'ORG-P2')`);
  await exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('BU-1', 'Meera', 'meera@buy.test', 'buyer', 'ORG-P')`);
  await exec(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-1', 'ORG-A', 'arabica', 'abcdef012345', ?, ?)`, [await anchor(), TS]);
}

async function custody(from: string, to: string, by = 'AD-1') {
  await exec(
    `INSERT INTO custody_transfers (id, batch_id, from_org, to_org, admin_id, transferred_at, signature, key_id, anchor_seq) VALUES (?, 'B-1', ?, ?, ?, ?, 'sig', 'kid', ?)`,
    [`CT-${nextSeq}`, from, to, by, TS, await anchor('custody_transfer')],
  );
}
const lock = () => exec(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`);

async function step(o: { id?: string; org?: string; user?: string; anchorKind?: string | null } = {}) {
  const seq = o.anchorKind === null ? 9999 : await anchor(o.anchorKind ?? 'processing_step');
  await exec(
    `INSERT INTO processing_steps (id, batch_id, processor_org, user_id, process, input_kg, output_kg, ratio, band_min, band_max, status, evidence, config_version, recorded_at, signature, key_id, anchor_seq)
     VALUES (?, 'B-1', ?, ?, 'hulling_parchment', 600, 480, 80, 75, 85, 'ok', 'Output 480.0 kg is 80.0% of input 600.0 kg (expected 75–85% for hulling parchment).', 'mb-1', ?, 'sig', 'kid', ?)`,
    [o.id ?? 'PS-1', o.org ?? 'ORG-P', o.user ?? 'PU-1', TS, seq],
  );
}

describe('custody FPO → processor → buyer (TSK-26.3, T4)', () => {
  it('the FPO hands an open batch to a processor; the processor hands it on to a buyer', async () => {
    await custody('ORG-A', 'ORG-P');
    await lock();
    await step();
    await custody('ORG-P', 'ORG-BUY');
    const rows = (await exec(`SELECT from_org, to_org FROM custody_transfers ORDER BY anchor_seq`)).rows.map((r) => [r.from_org, r.to_org]);
    expect(rows).toEqual([
      ['ORG-A', 'ORG-P'],
      ['ORG-P', 'ORG-BUY'],
    ]);
  });

  it('only the holder hands on, a processor only to a buyer, and a batch a buyer holds stays locked', async () => {
    await custody('ORG-A', 'ORG-P');
    await lock();
    await expect(custody('ORG-A', 'ORG-BUY')).rejects.toThrow(/holds the batch/); // the FPO no longer holds it
    await expect(custody('ORG-P2', 'ORG-BUY')).rejects.toThrow(/holds the batch/);
    await expect(custody('ORG-P', 'ORG-P2')).rejects.toThrow(/to a buyer organisation/); // processor → processor
    await expect(custody('ORG-P', 'ORG-A')).rejects.toThrow(/to a buyer organisation/); // back to the FPO
    await step();
    await custody('ORG-P', 'ORG-BUY');
    await expect(custody('ORG-BUY', 'ORG-BUY2')).rejects.toThrow(/not open/); // a buyer's batch is final
  });

  it('a processor hands a batch on only after it recorded its processing step (TKT-26 quality minor 2)', async () => {
    await custody('ORG-A', 'ORG-P');
    await lock();
    await expect(custody('ORG-P', 'ORG-BUY')).rejects.toThrow(/after its processing step/);
    expect(Number((await exec(`SELECT COUNT(*) AS n FROM custody_transfers`)).rows[0]!.n)).toBe(1);
    await step();
    await custody('ORG-P', 'ORG-BUY');
    expect(Number((await exec(`SELECT COUNT(*) AS n FROM custody_transfers`)).rows[0]!.n)).toBe(2);
  });

  it('the first hop goes to a buyer or a processor organisation, once', async () => {
    await expect(custody('ORG-A', 'ORG-A')).rejects.toThrow(/buyer organisation or a processor/);
    await expect(custody('ORG-A', 'ORG-NOPE')).rejects.toThrow(/buyer organisation or a processor|FOREIGN KEY/);
    await custody('ORG-A', 'ORG-P');
    await expect(custody('ORG-A', 'ORG-BUY')).rejects.toThrow(/already has a custody transfer/); // still open
  });
});

describe('processing_steps (TSK-26.3)', () => {
  beforeEach(async () => {
    await custody('ORG-A', 'ORG-P');
    await lock();
  });

  it('the processor holding the batch records a step anchored as processing_step', async () => {
    await step();
    expect(Number((await exec(`SELECT COUNT(*) AS n FROM processing_steps`)).rows[0]!.n)).toBe(1);
  });

  it('a step by a non-holder aborts (another processor, the FPO, and the processor after handing on)', async () => {
    await expect(step({ org: 'ORG-P2' })).rejects.toThrow(/holds the batch/);
    await expect(step({ org: 'ORG-A' })).rejects.toThrow(/processor organisation/);
    await step();
    await custody('ORG-P', 'ORG-BUY');
    await expect(step({ id: 'PS-2' })).rejects.toThrow(/holds the batch/);
  });

  it('the recording user must be a processor of the holding organisation (TKT-26 quality minor 2)', async () => {
    await expect(step({ user: 'AD-1' })).rejects.toThrow(/recorded by a processor of the organisation/); // an FPO admin
    await expect(step({ user: 'PU-2' })).rejects.toThrow(/recorded by a processor of the organisation/); // a processor of another org
    await expect(step({ user: 'BU-1' })).rejects.toThrow(/recorded by a processor of the organisation/); // in the org, but not a processor
    await expect(step({ user: 'NOPE' })).rejects.toThrow(/recorded by a processor of the organisation|FOREIGN KEY/);
    expect(Number((await exec(`SELECT COUNT(*) AS n FROM processing_steps`)).rows[0]!.n)).toBe(0);
    await step({ user: 'PU-1' });
    expect(Number((await exec(`SELECT COUNT(*) AS n FROM processing_steps`)).rows[0]!.n)).toBe(1);
  });

  it('a missing anchor, or an anchor of another kind, aborts', async () => {
    await expect(step({ anchorKind: null })).rejects.toThrow(/processing_step ledger entry|FOREIGN KEY/);
    await expect(step({ anchorKind: 'custody_transfer' })).rejects.toThrow(/processing_step ledger entry/);
  });

  it('at most one step per batch per processor; append-only, REPLACE included', async () => {
    await step();
    await expect(step({ id: 'PS-2' })).rejects.toThrow(/UNIQUE/);
    await expect(exec(`UPDATE processing_steps SET status = 'flag'`)).rejects.toThrow(/append-only/);
    await expect(exec(`DELETE FROM processing_steps`)).rejects.toThrow(/append-only/);
    await expect(step({ id: 'PS-1' })).rejects.toThrow(/append-only/);
  });

  it('the CHECKs refuse an unknown process or status and non-positive kilograms', async () => {
    const seq = await anchor('processing_step');
    const ins = (process: string, status: string, inKg: number) =>
      exec(
        `INSERT INTO processing_steps (id, batch_id, processor_org, user_id, process, input_kg, output_kg, ratio, band_min, band_max, status, evidence, config_version, recorded_at, signature, key_id, anchor_seq)
         VALUES ('PS-X', 'B-1', 'ORG-P', 'PU-1', ?, ?, 1, 1, 75, 85, ?, 'e', 'mb-1', ?, 's', 'k', ?)`,
        [process, inKg, status, TS, seq],
      );
    await expect(ins('roasting', 'ok', 1)).rejects.toThrow(/CHECK/);
    await expect(ins('drying', 'rejected', 1)).rejects.toThrow(/CHECK/);
    await expect(ins('drying', 'ok', 0)).rejects.toThrow(/CHECK/);
  });
});

describe('the user rebuild for the processor role', () => {
  it('accepts role processor and still refuses an unknown role', async () => {
    await expect(exec(`INSERT INTO user (id, name, email, role, org_id) VALUES ('X-1', 'x', 'x@x.test', 'owner', 'ORG-A')`)).rejects.toThrow(/CHECK/);
  });

  it('migrating a populated database keeps every row and every object except the intended changes', async () => {
    const MIGRATIONS = fileURLToPath(new URL('../../src/lib/db/migrations', import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), 'udgam-mig-'));
    try {
      // The migrations as they were before TKT-26 (up to 0027, after TKT-25's agreements), applied to a database with data.
      const old = join(dir, 'old');
      cpSync(MIGRATIONS, old, { recursive: true });
      const journal = JSON.parse(readFileSync(join(old, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
      const before = journal.entries.filter((e) => e.idx <= 27);
      const after = journal.entries.filter((e) => e.idx > 27).map((e) => e.tag);
      expect(after.slice(0, 3)).toEqual(['0028_prep_processing', '0029_processing', '0030_guards_processing']);
      writeFileSync(join(old, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: before }));
      for (const f of readdirSync(old)) if (after.some((tag) => f === `${tag}.sql`)) rmSync(join(old, f));

      const { db, client, ready } = createDb(`file:${join(dir, 'm.db')}`);
      await ready;
      try {
        await runMigrations(db, old);
        const x = (sql: string, args: InValue[] = []) => client.execute({ sql, args });
        let seq = 0;
        const entry = async (kind: string) => {
          seq += 1;
          await x(`INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (?, ?, ?, '{}', ?, ?, ?)`, [seq, H('0'), kind, H('a'), TS, seq.toString(16).padStart(64, '0')]);
          return seq;
        };
        await x(`INSERT INTO organisations (id, type, name) VALUES ('ORG-A', 'fpo', 'A'), ('ORG-BUY', 'buyer', 'Buyer')`);
        await x(`INSERT INTO user (id, name, email, role, org_id) VALUES ('AG-1', 'Agent', 'agent@a.test', 'agent', 'ORG-A')`);
        await x(`INSERT INTO user (id, name, email, role, org_id) VALUES ('AD-1', 'Admin', 'admin@a.test', 'admin', 'ORG-A')`);
        await x(`INSERT INTO user (id, name, email, role, org_id) VALUES ('BU-1', 'Buyer', 'buyer@b.test', 'buyer', 'ORG-BUY')`);
        await x(`INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('S-1', 1, 'tok', 1, 'AG-1'), ('S-2', 1, 'tok2', 1, 'BU-1')`);
        await x(`INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES ('A-1', 'AG-1', 'credential', 'AG-1', 'hash', 1)`);
        await x(`INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{}', 'kid', ?, ?)`, [TS, await entry('device_enrolled')]);
        await x(`INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-1', 'ORG-A', 'arabica', 'abcdef012345', ?, ?)`, [await entry('batch_created'), TS]);
        await x(
          `INSERT INTO custody_transfers (id, batch_id, from_org, to_org, admin_id, transferred_at, signature, key_id, anchor_seq) VALUES ('CT-1', 'B-1', 'ORG-A', 'ORG-BUY', 'AD-1', ?, 'sig', 'kid', ?)`,
          [TS, await entry('custody_transfer')],
        );
        await x(`UPDATE batches SET status = 'transferred' WHERE id = 'B-1'`);
        await x(
          `INSERT INTO agreements (id, chain_id_hex, buyer_org, fpo_org, crop, agreed_kg, min_grade, amount_paise, deadline, created_by, created_at, created_tx_hash, anchor_seq)
           VALUES ('AG-1', '0x01', 'ORG-BUY', 'ORG-A', 'arabica', 600, 70, 100, '2026-12-31T18:29:59.999Z', 'BU-1', ?, '0x', ?)`,
          [TS, await entry('agreement_created')],
        );

        type Obj = { type: string; tbl: string; sql: string | null };
        const objects = async () =>
          new Map(
            (await x(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`)).rows.map(
              (r) => [String(r.name), { type: String(r.type), tbl: String(r.tbl_name), sql: r.sql === null ? null : String(r.sql) } as Obj],
            ),
          );
        const tables = async (names: Iterable<string>) => {
          const out: Record<string, unknown[]> = {};
          for (const n of names) out[n] = (await x(`SELECT * FROM "${n}" ORDER BY rowid`)).rows.map((r) => ({ ...r }));
          return out;
        };
        const objsBefore = await objects();
        const tableNames = [...objsBefore].filter(([, o]) => o.type === 'table' && o.tbl !== '__drizzle_migrations').map(([n]) => n);
        const rowsBefore = await tables(tableNames);

        await runMigrations(db, MIGRATIONS); // 0028 onwards on top

        const objsAfter = await objects();
        // The intended changes, and nothing else.
        // admin_overrides_before_insert and verification_runs_after_hard_fail come from 0033 (P5 follow-up, TKT-12/13).
        const CHANGED = new Set(['user', 'custody_transfers_before_insert', 'quality_attestations_delivered_batch', 'admin_overrides_before_insert']);
        const DROPPED = new Set(['custody_transfers_one_hop_to_buyer']);
        const ADDED = [
          'custody_transfers_processor_step_required',
          'processing_steps',
          'processing_steps_batch_org_uq',
          'processing_steps_before_insert',
          'processing_steps_no_delete',
          'processing_steps_no_update',
          'processing_steps_org_idx',
          'processing_steps_recorder_is_processor',
          'settlements_one_release_per_batch_idx',
          'verification_runs_after_hard_fail',
        ];
        for (const [name, o] of objsBefore) {
          if (DROPPED.has(name)) expect(objsAfter.has(name), name).toBe(false);
          else if (CHANGED.has(name)) expect(objsAfter.get(name)?.sql, name).not.toBe(o.sql);
          else expect(objsAfter.get(name), name).toEqual(o);
        }
        expect([...objsAfter.keys()].filter((n) => !objsBefore.has(n)).sort()).toEqual(ADDED);
        expect(objsAfter.get('user')?.sql).toContain("'processor'");

        // Every row of every table is kept, column for column (no session or account cascaded away).
        expect(await tables(tableNames)).toEqual(rowsBefore);

        // The user triggers still work, and the references into the rebuilt `user` still bind.
        await expect(x(`DELETE FROM user WHERE id = 'AG-1'`)).rejects.toThrow(/referenced by devices/);
        await expect(x(`INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-2', 'NOPE', '{}', 'k2', ?, 1)`, [TS])).rejects.toThrow(/devices.agent_id/);
        await expect(x(`DELETE FROM user WHERE id = 'BU-1'`)).rejects.toThrow(/FOREIGN KEY/); // the agreement's created_by
        await expect(x(`INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('S-3', 1, 'tok3', 1, 'NOPE')`)).rejects.toThrow(/FOREIGN KEY/);
        // A buyer's batch stays locked.
        await expect(
          x(`INSERT INTO custody_transfers (id, batch_id, from_org, to_org, admin_id, transferred_at, signature, key_id, anchor_seq) VALUES ('CT-2', 'B-1', 'ORG-BUY', 'ORG-A', 'BU-1', ?, 'sig', 'kid', ?)`, [
            TS,
            await entry('custody_transfer'),
          ]),
        ).rejects.toThrow(/not open/);
        await x(`INSERT INTO user (id, name, email, role, org_id) VALUES ('PU-1', 'Ravi', 'ravi@p.test', 'processor', 'ORG-A')`);
        expect((await x(`PRAGMA legacy_alter_table`)).rows[0]![0]).toBe(0);
        expect((await x(`PRAGMA foreign_keys`)).rows[0]![0]).toBe(1);
        expect((await x(`PRAGMA foreign_key_check`)).rows).toEqual([]);
        expect((await x(`PRAGMA integrity_check`)).rows[0]![0]).toBe('ok');
      } finally {
        client.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

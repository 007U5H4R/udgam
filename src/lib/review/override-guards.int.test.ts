import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// TKT-12 database invariants for admin overrides (technical-plan §4.2, S8, TP14, CF-06; EXE16), tried
// directly in SQL so they hold for any writer: an override sets the event's final verdict; a hard-failed
// run, a batched event's run and an earlier (superseded) run cannot be overridden; an overridden event
// gets no new verification run; overrides are never replaced, updated or deleted (0010/0015/0016 pattern).

let t: TempDb;
const H = (c: string) => c.repeat(64);
const TS = '2026-10-01T00:00:00.000Z';
const OK = { id: 'geofence', status: 'ok', score: 1, weight: 1, hardFail: false, evidence: 'Inside the plot, 12 m from the edge' };
const HARD = { id: 'photo_uniqueness', status: 'fail', score: 0, weight: 1, hardFail: true, evidence: '1 of 1 photos seen before' };

beforeEach(async () => {
  t = await tempDb();
  await t.client.executeMultiple(`
    INSERT INTO organisations (id, type, name) VALUES ('ORG-A', 'fpo', 'A');
    INSERT INTO farmers (id, org_id, name, producer_id) VALUES ('FA-1', 'ORG-A', 'f', 'PR-1');
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('AG-1', 'Agent', 'a@x.test', 1, 0, 0, 'agent', 'ORG-A');
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('AD-1', 'Admin', 'd@x.test', 1, 0, 0, 'admin', 'ORG-A');
    INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash)
      VALUES (1, '${H('0')}', 'x', '{}', '${H('a')}', '${TS}', '${H('1')}');
    INSERT INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES ('PL-1', 'FA-1', 'arabica', '{}', 1, 1, '${TS}', '${TS}');
    INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{}', 'kid-1', '${TS}', 1);
  `);
});
afterEach(async () => {
  await t.cleanup();
});

const exec = (sql: string) => t.client.execute(sql);
const one = async (sql: string) => ({ ...(await t.client.execute(sql)).rows[0] });

async function event(id: string, n: number) {
  await exec(`INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, anchor_seq)
    VALUES ('${id}', 'PL-1', 'DV-1', 'AG-1', ${n}, '${TS}', 40, '{}', '${H(String(n))}', 'sig', 'accepted', 1)`);
}
async function run(id: string, eventId: string, runNo: number, verdict: string, checks: unknown[]) {
  await exec(`INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
    VALUES ('${id}', '${eventId}', ${runNo}, '${verdict}', 64, '${JSON.stringify(checks)}', '[]', 'cfg-1', '${H('c')}', '${TS}', 1)`);
}
const override = (id: string, runId: string, verb = 'INSERT', verdict = 'Verified') =>
  exec(`${verb} INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq)
    VALUES ('${id}', '${runId}', 'AD-1', '${verdict}', 'Scale photo checked by the office', 'sig', 'kid', '${TS}', 1)`);

describe('admin_overrides invariants (§4.2, CF-06)', () => {
  it('an override sets the event final verdict', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Needs Review' });
    await override('AO-1', 'VR-1');
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Verified' });
  });

  it('a raw insert for a run with a hard fail aborts (TC-056, EVAL-076)', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Rejected', [OK, HARD]);
    await expect(override('AO-1', 'VR-1')).rejects.toThrow('hard-failed run cannot be overridden');
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 0 });
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Rejected' });
  });

  it('a run of a batched event cannot be overridden (EXE16: its verdict is frozen in batch_created)', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Verified', [OK]);
    await t.client.executeMultiple(`
      INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-1', 'ORG-A', 'arabica', 'abc', 1, '${TS}');
      INSERT INTO batch_events (batch_id, event_id) VALUES ('B-1', 'HE-1');
    `);
    await expect(override('AO-1', 'VR-1', 'INSERT', 'Rejected')).rejects.toThrow('event is in a batch');
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 0 });
  });

  it('only the latest run of an event can be overridden', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await run('VR-2', 'HE-1', 2, 'Needs Review', [OK]);
    await expect(override('AO-1', 'VR-1')).rejects.toThrow('only the latest run');
    await expect(override('AO-2', 'VR-2')).resolves.toBeDefined();
  });

  it('an overridden event gets no new verification run (the decision is final)', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await override('AO-1', 'VR-1');
    await expect(run('VR-2', 'HE-1', 2, 'Verified', [OK])).rejects.toThrow('decided by an admin');
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Verified' });
  });

  it('a second override of the same run, REPLACE, UPDATE and DELETE are all refused', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await override('AO-1', 'VR-1');
    for (const verb of ['INSERT', 'INSERT OR REPLACE', 'REPLACE']) {
      await expect(override('AO-2', 'VR-1', verb, 'Rejected'), verb).rejects.toThrow(/UNIQUE/);
      await expect(override('AO-1', 'VR-1', verb, 'Rejected'), verb).rejects.toThrow(/UNIQUE/);
    }
    await expect(exec(`UPDATE admin_overrides SET reason = 'Something else entirely'`)).rejects.toThrow('never updated');
    await expect(exec(`DELETE FROM admin_overrides`)).rejects.toThrow('never deleted');
    expect(await one(`SELECT COUNT(*) AS n, MAX(new_verdict) AS v FROM admin_overrides`)).toEqual({ n: 1, v: 'Verified' });
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Verified' });
  });

  it('a reason shorter than 10 characters and a verdict other than Verified or Rejected are refused', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await expect(
      exec(`INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq)
        VALUES ('AO-1', 'VR-1', 'AD-1', 'Verified', '   short   ', 'sig', 'kid', '${TS}', 1)`),
    ).rejects.toThrow(/CHECK/);
    await expect(override('AO-1', 'VR-1', 'INSERT', 'Needs Review')).rejects.toThrow(/CHECK/);
  });
});

// Fix round 1 (quality minor 3, major 1): defence in depth for what the app never writes.
describe('admin decision update guards (TKT-12 fix round 1)', () => {
  const reasonInsert = (reason: string) =>
    exec(`INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq)
      VALUES ('AO-1', 'VR-1', 'AD-1', 'Verified', '${reason}', 'sig', 'kid', '${TS}', 1)`);

  it("a decided event's final verdict cannot be rewritten; the override's own trigger still sets it", async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await override('AO-1', 'VR-1', 'INSERT', 'Rejected');
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Rejected' });
    await expect(exec(`UPDATE harvest_events SET final_verdict = 'Verified' WHERE id = 'HE-1'`)).rejects.toThrow('decided by an admin');
    await expect(exec(`UPDATE harvest_events SET final_verdict = NULL WHERE id = 'HE-1'`)).rejects.toThrow('decided by an admin');
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Rejected' });
    // an undecided event is not affected by this guard
    await event('HE-2', 2);
    await exec(`UPDATE harvest_events SET final_verdict = 'Needs Review' WHERE id = 'HE-2'`);
  });

  it("a verification run is immutable once written: its checks, score, verdict, run_no and event can't change", async () => {
    await event('HE-1', 1);
    await event('HE-2', 2);
    await run('VR-1', 'HE-1', 1, 'Rejected', [OK, HARD]);
    for (const set of [`checks = '[]'`, 'score = 99', `verdict = 'Needs Review'`, 'run_no = 7', `event_id = 'HE-2'`]) {
      await expect(exec(`UPDATE verification_runs SET ${set} WHERE id = 'VR-1'`), set).rejects.toThrow('frozen once written');
    }
    // so a hard fail can't be cleared and then overridden in two raw statements (CF-06)
    await expect(override('AO-1', 'VR-1')).rejects.toThrow('hard-failed run cannot be overridden');
    expect(await one(`SELECT checks, score, verdict FROM verification_runs WHERE id = 'VR-1'`)).toEqual({ checks: JSON.stringify([OK, HARD]), score: 64, verdict: 'Rejected' });
  });

  it('only a Needs Review run can be overridden', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Verified', [OK]);
    await expect(override('AO-1', 'VR-1', 'INSERT', 'Rejected')).rejects.toThrow('only a Needs Review run');
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 0 });
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-1'`)).toEqual({ final_verdict: 'Verified' });
  });

  it('a decided, batched event: a new run and a second override name the batch first', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    await override('AO-1', 'VR-1');
    await t.client.executeMultiple(`
      INSERT INTO batches (id, org_id, crop, short_hash, anchor_seq, created_at) VALUES ('B-1', 'ORG-A', 'arabica', 'abc', 1, '${TS}');
      INSERT INTO batch_events (batch_id, event_id) VALUES ('B-1', 'HE-1');
    `);
    await expect(run('VR-2', 'HE-1', 2, 'Verified', [OK])).rejects.toThrow('event is in a batch');
    await expect(override('AO-2', 'VR-1', 'INSERT', 'Rejected')).rejects.toThrow('event is in a batch');
  });

  it('the reason check also refuses blank-rendering characters and tag characters; ZWJ/ZWNJ only inside Kannada (TKT-12 r2 N2, N5, N6)', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    for (const reason of [
      '⠀'.repeat(12),
      'Checkedㅤin person',
      'Checkedᅟin person',
      'Checkedᅠin person',
      'Checkedﾠin person',
      'Checked in person \u{E0001}',
      'Checked in person \u{E0020}\u{E0041}\u{E007F}',
      'Checked in‍ person',
      'Checked in‌ person',
      '‍ಕಚೇರಿ ಪರಿಶೀಲನೆ',
      'ಕಚೇರಿ ಪರಿಶೀಲನೆ‌',
      'ಕಚೇರಿ‍ person checked',
    ]) {
      await expect(reasonInsert(reason), JSON.stringify(reason)).rejects.toThrow('hidden or control characters');
    }
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 0 });
    await reasonInsert('ಕಚೇರಿಯಲ್ಲಿ ಕರ‍್ನಾಟಕದ ತೂಕ ಪರಿಶೀಲನೆ'); // ZWJ inside a Kannada run (arkavattu) is allowed
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 1 });
  });

  it('no new run after a hard-failed run of the same event, so a clean run cannot be slipped in and overridden (CF-06, TKT-12 r2 N3)', async () => {
    await event('HE-2', 2);
    await run('VR-1', 'HE-2', 1, 'Rejected', [OK, HARD]);
    await expect(run('VR-2', 'HE-2', 2, 'Needs Review', [OK])).rejects.toThrow('a hard fail is final: no new run after a hard-failed run');
    expect(await one(`SELECT COUNT(*) AS n FROM verification_runs WHERE event_id = 'HE-2'`)).toEqual({ n: 1 });
    expect(await one(`SELECT final_verdict FROM harvest_events WHERE id = 'HE-2'`)).toEqual({ final_verdict: 'Rejected' });
    // an event whose runs have no hard fail still takes a re-run
    await event('HE-3', 3);
    await run('VR-3', 'HE-3', 1, 'Needs Review', [OK]);
    await run('VR-4', 'HE-3', 2, 'Verified', [OK]);
    expect(await one(`SELECT COUNT(*) AS n FROM verification_runs WHERE event_id = 'HE-3'`)).toEqual({ n: 2 });
  });

  it('a reason with hidden or control characters is refused (zero-width spaces, bidi override, separators)', async () => {
    await event('HE-1', 1);
    await run('VR-1', 'HE-1', 1, 'Needs Review', [OK]);
    for (const reason of ['\u200B'.repeat(12), 'Checked in person \u202Eenoz', 'Checked in\u2028person', 'Checked\tin person', 'Checked in\uFEFF person']) {
      await expect(reasonInsert(reason), JSON.stringify(reason)).rejects.toThrow('hidden or control characters');
    }
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 0 });
    await reasonInsert('Scale photo retaken.\nChecked in person.'); // a newline is allowed
    expect(await one(`SELECT COUNT(*) AS n FROM admin_overrides`)).toEqual({ n: 1 });
  });
});

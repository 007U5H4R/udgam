import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { coffeeSeasonOf, seasonCherryKgBefore } from './season';

// TC-038 (cumulative part), TSK-09.2, TP6: Σ cherry_kg of this plot's events in the season with
// boundary_status='accepted' and final_verdict ≠ 'Rejected'; boundary-rejected events, Rejected events,
// other plots and other seasons do not count. Rows are written directly in SQL (the verdict trigger sets
// final_verdict from each event's verification run).

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
    INSERT INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES ('PL-2', 'FA-1', 'arabica', '{}', 1, 1, '${TS}', '${TS}');
    INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-1', 'AG-1', '{}', 'kid-1', '${TS}', 1);
  `);
});
afterEach(async () => {
  await t.cleanup();
});

function H(c: string) {
  return c.repeat(64);
}
const TS = '2026-10-01T00:00:00.000Z';
let n = 0;

/** One event; accepted events get a run with `verdict` (the trigger copies it to final_verdict). */
async function event(o: { plot?: string; kg: number; at: string; status?: 'accepted' | 'rejected'; verdict?: 'Verified' | 'Needs Review' | 'Rejected' }) {
  n += 1;
  const id = `HE-${n}`;
  const status = o.status ?? 'accepted';
  await t.client.execute({
    sql: `INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, boundary_reason, anchor_seq)
          VALUES (?, ?, 'DV-1', 'AG-1', ?, ?, ?, '{}', ?, 'sig', ?, ?, 1)`,
    args: [id, o.plot ?? 'PL-1', n, o.at, o.kg, n.toString(16).padStart(64, '0'), status, status === 'rejected' ? 'media_hash_mismatch' : null],
  });
  if (status === 'accepted') {
    await t.client.execute({
      sql: `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
            VALUES (?, ?, 1, ?, 90, '[]', '[]', 'cfg-1', ?, ?, 1)`,
      args: [`VR-${n}`, id, o.verdict ?? 'Verified', H('c'), o.at],
    });
  }
}

const season2026 = coffeeSeasonOf('2026-12-08T05:30:00.000Z');

describe('seasonCherryKgBefore (TC-038 cumulative)', () => {
  it('is 0 for a plot with no events', async () => {
    expect(await seasonCherryKgBefore(t.db, 'PL-1', season2026)).toBe(0);
  });

  it('sums accepted, non-Rejected events on this plot in this season only', async () => {
    await event({ kg: 100, at: '2026-10-02T04:00:00.000Z' }); // counts (Verified)
    await event({ kg: 50.5, at: '2026-12-01T04:00:00.000Z', verdict: 'Needs Review' }); // counts
    await event({ kg: 1000, at: '2026-12-02T04:00:00.000Z', verdict: 'Rejected' }); // Rejected by a check: excluded
    await event({ kg: 2000, at: '2026-12-03T04:00:00.000Z', status: 'rejected' }); // boundary-rejected: excluded
    await event({ kg: 4000, plot: 'PL-2', at: '2026-12-03T04:00:00.000Z' }); // another plot: excluded
    await event({ kg: 8000, at: '2026-09-30T18:29:59.999Z' }); // 30 Sep 23:59:59.999 IST: previous season
    await event({ kg: 7, at: '2026-09-30T18:30:00.000Z' }); // 1 Oct 00:00 IST: this season
    await event({ kg: 16000, at: '2027-09-30T18:30:00.000Z' }); // next season
    expect(await seasonCherryKgBefore(t.db, 'PL-1', season2026)).toBe(157.5);
    expect(await seasonCherryKgBefore(t.db, 'PL-1', coffeeSeasonOf('2026-09-30T18:29:59.999Z'))).toBe(8000);
    expect(await seasonCherryKgBefore(t.db, 'PL-2', season2026)).toBe(4000);
  });
});

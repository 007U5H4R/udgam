import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE } from '../../../../scripts/tracer-world';
import { seedFpo, type FpoWorld } from '../../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { persistAccepted, persistRejected } from '../../capture/persist';
import { jcs, sha256Hex, sign } from '../../crypto';
import type { CheckResult, CapturePayloadV1, Verdict } from '../../verification/types';
import { writeTx } from '../client';
import { istMonth, latestRuns, listPickings, PICKINGS_LIMIT } from './pickings';

// TSK-11.4 / TC-051: the Pickings tab lists only this agent's pickings (and this agent's refusals) in its
// own organisation, grouped by IST month, newest first; Needs a check carries the reason and Not
// accepted the reason and what to do, in the farmer's words.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-pickings-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const ok = (id: CheckResult['id'], evidence = 'fine'): CheckResult => ({ id, status: 'ok', score: 1, weight: 1, hardFail: false, evidence });

/** One accepted picking by `world`'s phone, received at `at`, with one run of `checks`. */
async function picking(world: FpoWorld, o: { at: string; kg: number; verdict: Verdict; checks: CheckResult[]; crop?: 'arabica' | 'robusta' }) {
  const d = world.device;
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plots[o.crop ?? 'arabica'].plotId,
    deviceId: d.id,
    seq: d.seq + 1,
    prevEventHash: d.last,
    capturedAt: o.at,
    gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
    cherryKg: o.kg,
    media: [{ sha256: (await sha256Hex(`${o.at}${o.kg}`)).slice(0, 64), size: 1000, mime: 'image/jpeg' }],
  };
  const payloadString = jcs(payload);
  const payloadHash = await sha256Hex(payloadString);
  const signature = await sign(d.pair.privateKey, payloadString);
  const ids = await writeTx(t.db, (tx) =>
    persistAccepted(tx, {
      payload,
      payloadString,
      payloadHash,
      signature,
      serverReceivedAt: o.at,
      device: { id: d.id, agentId: world.agentId, publicJwk: d.publicJwk, revokedAt: null, lastSeq: d.seq, lastEventHash: d.last === 'genesis' ? null : d.last },
      media: [],
      result: { verdict: o.verdict, score: 0, checks: o.checks, unavailableProviders: [], capReasons: [], config: { version: 'cfg-1', hash: '0'.repeat(64) } },
    }),
  );
  d.seq += 1;
  d.last = payloadHash;
  return ids.eventId;
}

/** A boundary refusal of a picking signed by `world`'s phone (attributable: the key verified). */
async function refusal(world: FpoWorld, o: { at: string; kg: number; reason: string }) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plots.arabica.plotId,
    deviceId: world.device.id,
    seq: world.device.seq + 1,
    prevEventHash: world.device.last,
    capturedAt: o.at,
    gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
    cherryKg: o.kg,
    media: [{ sha256: 'b'.repeat(64), size: 1000, mime: 'image/jpeg' }],
  };
  const payloadString = jcs(payload);
  const { eventId } = await writeTx(t.db, (tx) =>
    persistRejected(tx, {
      payloadString,
      payloadHash: `${o.reason}-${o.at}`.padEnd(64, '0'),
      signature: 'sig',
      serverReceivedAt: o.at,
      reason: o.reason,
      payload,
      device: { id: world.device.id, agentId: world.agentId, publicJwk: world.device.publicJwk, revokedAt: null, lastSeq: world.device.seq, lastEventHash: null },
    }),
  );
  return eventId;
}

const inside = ok('geofence', 'Inside the plot, 14 m from the edge');

describe('istMonth', () => {
  it('reads the month in IST: 2026-09-30T19:00Z is 1 October, 00:30 IST; 18:29Z is still September', () => {
    expect(istMonth('2026-09-30T19:00:00.000Z')).toBe('2026-10');
    expect(istMonth('2026-09-30T18:29:59.999Z')).toBe('2026-09');
    expect(istMonth('2026-09-30T18:30:00.000Z')).toBe('2026-10');
  });
});

describe('listPickings', () => {
  it("returns only this agent's events in this organisation, newest first, grouped by IST month", async () => {
    const sep = await picking(w, { at: '2026-09-27T05:00:00.000Z', kg: 44, verdict: 'Verified', checks: [inside] });
    const oct = await picking(w, { at: '2026-09-30T19:00:00.000Z', kg: 38.5, verdict: 'Verified', checks: [inside] });
    // another agent in another organisation
    const other = await seedFpo(t.db);
    await picking(other, { at: '2026-09-28T05:00:00.000Z', kg: 51, verdict: 'Verified', checks: [inside] });

    const months = await listPickings(t.db, w.agentId, w.orgId);
    expect(months.map((m) => [m.month, m.items.map((i) => i.eventId)])).toEqual([
      ['2026-10', [oct]],
      ['2026-09', [sep]],
    ]);
    expect(months[1]!.items[0]).toEqual({ eventId: sep, receivedAt: '2026-09-27T05:00:00.000Z', cherryKg: 44, plotName: 'Plot 1', verdict: 'Verified' });
    // the organisation comes from the session: the same agent under another org id sees nothing accepted
    expect(await listPickings(t.db, w.agentId, other.orgId)).toEqual([]);
    expect((await listPickings(t.db, other.agentId, other.orgId)).flatMap((m) => m.items).map((i) => i.cherryKg)).toEqual([51]);
  });

  it('Needs a check carries the reason; Not accepted carries the reason and what to do (the farmer copy layer)', async () => {
    const cloudy: CheckResult = { id: 'ndvi_harvest_window', status: 'unavailable', score: 0, weight: 1, hardFail: false, evidence: 'Satellite view blocked by cloud for ±15 days', provider: 'sentinel-hub' };
    const review = await picking(w, { at: '2026-09-24T05:00:00.000Z', kg: 38.5, verdict: 'Needs Review', checks: [inside, cloudy] });
    const outside: CheckResult = { id: 'geofence', status: 'fail', score: 0, weight: 1, hardFail: false, evidence: '212 m outside the plot edge (allowance 25 m)' };
    const rejected = await picking(w, { at: '2026-09-18T05:00:00.000Z', kg: 29, verdict: 'Rejected', checks: [outside] });

    const items = (await listPickings(t.db, w.agentId, w.orgId)).flatMap((m) => m.items);
    expect(items.find((i) => i.eventId === review)).toMatchObject({
      verdict: 'Needs Review',
      reason: { icon: 'cloud', text: 'The satellite picture for this month was cloudy.' },
    });
    expect(items.find((i) => i.eventId === review)!.whatToDo).toBeUndefined();
    expect(items.find((i) => i.eventId === rejected)).toMatchObject({
      verdict: 'Rejected',
      plotName: 'Plot 1',
      reason: { icon: 'location', text: 'Your phone was 212 m outside Plot 1.' },
      whatToDo: 'Stand inside Plot 1 and record the picking again. If you were inside, tell the office.',
    });
  });

  it("includes this agent's boundary refusals as Not accepted with the refusal's reason; another agent's are never listed", async () => {
    const refused = await refusal(w, { at: '2026-09-20T05:00:00.000Z', kg: 30, reason: 'plot_not_assigned' });
    const other = await seedFpo(t.db);
    await refusal(other, { at: '2026-09-21T05:00:00.000Z', kg: 31, reason: 'device_revoked' });

    const items = (await listPickings(t.db, w.agentId, w.orgId)).flatMap((m) => m.items);
    expect(items).toEqual([
      {
        eventId: refused,
        receivedAt: '2026-09-20T05:00:00.000Z',
        cherryKg: 30,
        plotName: 'Plot 1',
        verdict: 'Rejected',
        reason: { icon: 'seal', text: 'This plot is not assigned to you.' },
        whatToDo: 'Ask the office to assign it to you, then record the picking again.',
      },
    ]);
  });

  it('speaks Kannada when asked', async () => {
    await picking(w, { at: '2026-09-27T05:00:00.000Z', kg: 44, verdict: 'Verified', checks: [inside] });
    const [m] = await listPickings(t.db, w.agentId, w.orgId, 'kn');
    expect(m!.items[0]!.plotName).toBe('ತೋಟ 1');
  });

  // TASK-12 fix round 1 (quality minor 5): the list is bounded (the newest PICKINGS_LIMIT), so one
  // inArray over the event ids never nears SQLite's bound-parameter limit over a long season.
  it('returns at most `limit` pickings, the newest; the default limit is 200', async () => {
    await picking(w, { at: '2026-09-25T05:00:00.000Z', kg: 30, verdict: 'Verified', checks: [inside] });
    const b = await picking(w, { at: '2026-09-26T05:00:00.000Z', kg: 31, verdict: 'Verified', checks: [inside] });
    const c = await picking(w, { at: '2026-09-27T05:00:00.000Z', kg: 32, verdict: 'Verified', checks: [inside] });
    expect((await listPickings(t.db, w.agentId, w.orgId, 'en', { limit: 2 })).flatMap((m) => m.items).map((i) => i.eventId)).toEqual([c, b]);
    expect(PICKINGS_LIMIT).toBe(200);
  });
});

describe('latestRuns', () => {
  it('reads only the latest run of each event: a re-run (run 2) decides the verdict and the checks', async () => {
    const e = await picking(w, { at: '2026-09-27T05:00:00.000Z', kg: 44, verdict: 'Needs Review', checks: [inside] });
    const cloudy: CheckResult = { id: 'ndvi_harvest_window', status: 'flag', score: 0.5, weight: 1, hardFail: false, evidence: 'clear' };
    await t.client.execute({
      sql: `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
        VALUES ('VR-RERUN', ?, 2, 'Verified', 91.7, ?, '[]', 'cfg-1', ?, '2026-09-28T05:00:00.000Z', 1)`,
      args: [e, JSON.stringify([inside, cloudy]), '0'.repeat(64)],
    });
    // another event with only its first run: its run 1 is its latest
    const single = await picking(w, { at: '2026-09-29T05:00:00.000Z', kg: 40, verdict: 'Verified', checks: [inside] });
    const runs = await latestRuns(t.db, [e, single]);
    expect([...runs.keys()].sort()).toEqual([e, single].sort());
    expect(runs.get(single)).toMatchObject({ verdict: 'Verified' });
    expect(runs.get(e)).toMatchObject({ verdict: 'Verified', score: 91.7 });
    expect(runs.get(e)!.checks.map((c) => c.id)).toEqual(['geofence', 'ndvi_harvest_window']);
  });
});

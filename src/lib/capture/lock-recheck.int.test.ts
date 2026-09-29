import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { verifyChain } from '../ledger/hashchain';
import { localMediaStore, type MediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { coffeeSeasonOf, seasonCherryKgBefore } from '../yield/season';
import { runCapture, type CaptureEvent } from './pipeline';

// TKT-09 fix round 1 (quality review #1): the checks that read what a concurrent commit changes — the
// plot's season kg (yield_plausibility), the phone's chain head and the agent's accepted count
// (chain_continuity), the seen photos (photo_uniqueness) — are re-run under the write lock. Different
// captures in flight at once must get the verdicts they would get one after the other.
//
// World: the arabica tracer plot shrunk to 0.1 ha. U = 783 kg/ha, cherry→clean 1/6, so each 400 kg
// capture adds 400 / 6 / 0.1 / 783 = 0.85x U: one is 0.85x (ok), two 1.70x (flag), three 2.55x (hard fail).

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
const RECEIVED = new Date('2026-10-14T04:12:34.000Z');

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  await t.client.execute({ sql: 'UPDATE plots SET area_ha = 0.1 WHERE id = ?', args: [world.plotId] });
});
afterEach(async () => {
  await t.cleanup();
});

/** A 400 kg capture at seq 1 from genesis, with its own photos (each label distinct). */
async function capture400(label: string, capturedAt: string) {
  const photos = [fakeJpeg(`${label}-1`), fakeJpeg(`${label}-2`)];
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt,
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 400,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', signed);
  fd.set('signature', await sign(dev.pair.privateKey, signed));
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return { fd, hash: await sha256Hex(signed) };
}

/** Every request pauses after storing its first photo until `k` requests have: all pass verification before any commits. */
function barrierStore(k: number): MediaStore {
  const real = localMediaStore(t.dir);
  let arrived = 0;
  let release!: () => void;
  const allStored = new Promise<void>((r) => (release = r));
  return {
    ...real,
    put: async (...a) => {
      const stored = await real.put(...a);
      if (++arrived === k) release();
      await allStored;
      return stored;
    },
  };
}

async function run(fd: FormData, media: MediaStore) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, { db: t.db, media, agentId: world.agentId, now: () => RECEIVED }, (e) => events.push(e));
  const last = events.at(-1);
  if (last?.t !== 'verdict') throw new Error(`expected a verdict, got ${JSON.stringify(last)}`);
  return last;
}

const check = (v: Extract<CaptureEvent, { t: 'verdict' }>, id: string) => v.checks.find((c) => c.id === id);
const YIELD_085 = 'Season total 0.85x the reference upper bound (flag above 1.50x, hard fail above 2.00x)';
const YIELD_170 = 'Season total 1.70x the reference upper bound (flag above 1.50x, hard fail above 2.00x)';
const YIELD_255 = 'Season total 2.55x the reference upper bound (flag above 1.50x, hard fail above 2.00x)';

async function stored() {
  const rows = await t.client.execute(
    `SELECT e.id, e.seq, e.cherry_kg, e.final_verdict, e.payload_hash, r.verdict, r.checks
       FROM harvest_events e JOIN verification_runs r ON r.event_id = e.id
      WHERE e.boundary_status = 'accepted' ORDER BY e.anchor_seq`,
  );
  return rows.rows.map((r) => ({
    id: String(r.id),
    seq: Number(r.seq),
    kg: Number(r.cherry_kg),
    finalVerdict: String(r.final_verdict),
    runVerdict: String(r.verdict),
    payloadHash: String(r.payload_hash),
    checks: JSON.parse(String(r.checks)) as { id: string; status: string; evidence: string }[],
  }));
}
async function ledgerRunVerdicts() {
  const rows = await t.client.execute(`SELECT payload FROM ledger_entries WHERE kind = 'verification_run' ORDER BY seq`);
  return rows.rows.map((r) => {
    const p = JSON.parse(String(r.payload)) as { eventId: string; verdict: string };
    return { eventId: p.eventId, verdict: p.verdict };
  });
}
async function device() {
  const [d] = (await t.client.execute({ sql: 'SELECT last_seq, last_event_hash FROM devices WHERE id = ?', args: [world.deviceId] })).rows;
  return { lastSeq: Number(d!.last_seq), lastEventHash: d!.last_event_hash };
}
const seasonKg = () => seasonCherryKgBefore(t.db, world.plotId, coffeeSeasonOf(RECEIVED.toISOString()));

describe('different captures in flight at once are re-checked under the write lock (yield, chain, photos)', () => {
  it('two 400 kg captures at seq 1 on a 0.1 ha arabica plot → one Verified, the other Needs Review at 1.70x with a chain flag', async () => {
    const a = await capture400('a', '2026-10-14T04:12:33.000Z');
    const b = await capture400('b', '2026-10-14T04:12:35.000Z');
    const media = barrierStore(2);
    const [va, vb] = await Promise.all([run(a.fd, media), run(b.fd, media)]);

    const byVerdict = new Map([va, vb].map((v, i) => [v.verdict, { v, hash: [a.hash, b.hash][i]! }]));
    expect([...byVerdict.keys()].sort()).toEqual(['Needs Review', 'Verified']);
    const won = byVerdict.get('Verified')!;
    const lost = byVerdict.get('Needs Review')!;
    expect(check(won.v, 'yield_plausibility')).toMatchObject({ status: 'ok', evidence: YIELD_085 });
    expect(check(won.v, 'chain_continuity')).toMatchObject({ status: 'ok', evidence: 'Entry 1 follows entry 0 from this phone' });
    expect(check(lost.v, 'yield_plausibility')).toMatchObject({ status: 'flag', evidence: YIELD_170 });
    expect(check(lost.v, 'chain_continuity')).toMatchObject({ status: 'flag', evidence: `Expected entry 2 after ${won.hash.slice(0, 8)}, got entry 1` });
    expect(check(lost.v, 'photo_uniqueness')).toMatchObject({ status: 'ok' });

    // what was stored is what was answered: rows, runs and ledger anchors carry the re-scored verdicts
    const rows = await stored();
    expect(rows.map(({ id, seq, kg, finalVerdict, runVerdict, payloadHash }) => ({ id, seq, kg, finalVerdict, runVerdict, payloadHash }))).toEqual([
      { id: won.v.eventId, seq: 1, kg: 400, finalVerdict: 'Verified', runVerdict: 'Verified', payloadHash: won.hash },
      { id: lost.v.eventId, seq: 1, kg: 400, finalVerdict: 'Needs Review', runVerdict: 'Needs Review', payloadHash: lost.hash },
    ]);
    expect(rows[1]!.checks.find((c) => c.id === 'yield_plausibility')).toMatchObject({ status: 'flag', evidence: YIELD_170 });
    expect(rows[1]!.checks.find((c) => c.id === 'chain_continuity')).toMatchObject({ status: 'flag' });
    expect(await ledgerRunVerdicts()).toEqual([
      { eventId: won.v.eventId, verdict: 'Verified' },
      { eventId: lost.v.eventId, verdict: 'Needs Review' },
    ]);
    expect(await seasonKg()).toBe(800);
    expect(await device()).toEqual({ lastSeq: 1, lastEventHash: won.hash }); // the head never rewinds or forks
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('three in flight → the third reaches the hard-fail band (2.55x) and is Rejected by yield', async () => {
    const caps = [
      await capture400('a', '2026-10-14T04:12:31.000Z'),
      await capture400('b', '2026-10-14T04:12:32.000Z'),
      await capture400('c', '2026-10-14T04:12:33.000Z'),
    ];
    const media = barrierStore(3);
    const verdicts = await Promise.all(caps.map((c) => run(c.fd, media)));

    const byVerdict = new Map(verdicts.map((v, i) => [v.verdict, { v, hash: caps[i]!.hash }]));
    expect([...byVerdict.keys()].sort()).toEqual(['Needs Review', 'Rejected', 'Verified']);
    const first = byVerdict.get('Verified')!;
    const second = byVerdict.get('Needs Review')!;
    const third = byVerdict.get('Rejected')!;
    expect(check(first.v, 'yield_plausibility')).toMatchObject({ status: 'ok', evidence: YIELD_085 });
    expect(check(second.v, 'yield_plausibility')).toMatchObject({ status: 'flag', evidence: YIELD_170 });
    expect(check(third.v, 'yield_plausibility')).toMatchObject({ status: 'fail', evidence: YIELD_255 });
    const chainFlag = `Expected entry 2 after ${first.hash.slice(0, 8)}, got entry 1`;
    expect(check(second.v, 'chain_continuity')).toMatchObject({ status: 'flag', evidence: chainFlag });
    expect(check(third.v, 'chain_continuity')).toMatchObject({ status: 'flag', evidence: chainFlag });

    const rows = await stored();
    expect(rows.map(({ id, kg, finalVerdict, runVerdict }) => ({ id, kg, finalVerdict, runVerdict }))).toEqual([
      { id: first.v.eventId, kg: 400, finalVerdict: 'Verified', runVerdict: 'Verified' },
      { id: second.v.eventId, kg: 400, finalVerdict: 'Needs Review', runVerdict: 'Needs Review' },
      { id: third.v.eventId, kg: 400, finalVerdict: 'Rejected', runVerdict: 'Rejected' },
    ]);
    expect(rows[2]!.checks.find((c) => c.id === 'yield_plausibility')).toMatchObject({ status: 'fail', evidence: YIELD_255 });
    expect(await ledgerRunVerdicts()).toEqual([
      { eventId: first.v.eventId, verdict: 'Verified' },
      { eventId: second.v.eventId, verdict: 'Needs Review' },
      { eventId: third.v.eventId, verdict: 'Rejected' },
    ]);
    expect(await seasonKg()).toBe(800); // the Rejected capture does not count toward the season
    expect(await device()).toEqual({ lastSeq: 1, lastEventHash: first.hash });
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });
});

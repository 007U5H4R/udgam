import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, randomId, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { barrierStore as sharedBarrier } from '../../../tests/helpers/barrier-store';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, publicMembers, sha256Hex, sign } from '../crypto';
import { writeTx } from '../db/client';
import { devices, harvestEvents } from '../db/schema';
import { assignPlot, unassignPlot } from '../enrolment/assign';
import { revokeDevice } from '../enrolment/enrol';
import { append, verifyChain } from '../ledger/hashchain';
import { createLogger } from '../log';
import { localMediaStore, type MediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { coffeeSeasonOf, seasonCherryKgBefore } from '../yield/season';
import { findRejection, isUniqueViolation, winnerAfterUniqueViolation } from './idempotency';
import { runCapture, type CaptureDeps, type CaptureEvent } from './pipeline';

// TC-040, EVAL-068, CF-14 (TSK-09.6, TP7, EV15, §3.1 step 3). An identical signed payload gets its original
// event and verdict back and writes nothing; only an ACCEPTED payload short-circuits, so a stored refusal
// never blocks the genuine capture of the same payload; the duplicate-resend race answers the loser with
// the winner's verdict; a replay still needs a valid signature and the owning agent.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
const SEED_ENTRIES = 2; // plot_registered + device_enrolled
const RECEIVED = new Date('2026-10-14T04:12:34.000Z');

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
});
afterEach(async () => {
  await t.cleanup();
});

type Signed = { fd: FormData; signed: string; photos: Uint8Array<ArrayBuffer>[] };

/** A capture signed by the phone; `photos` default to one fresh photo per call label. */
async function signedCapture(
  o: { label?: string; photos?: Uint8Array<ArrayBuffer>[]; capturedAt?: string; seq?: number; prevEventHash?: string; key?: TestDevice; deviceId?: string; gps?: { lat: number; lng: number } } = {},
): Promise<Signed> {
  const photos = o.photos ?? [fakeJpeg(`${o.label ?? 'p'}-1`), fakeJpeg(`${o.label ?? 'p'}-2`)];
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: o.deviceId ?? world.deviceId,
    seq: o.seq ?? 1,
    prevEventHash: o.prevEventHash ?? 'genesis',
    capturedAt: o.capturedAt ?? '2026-10-14T04:12:33.120Z',
    gps: { ...(o.gps ?? P01_INSIDE), accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const signed = jcs(payload);
  return { fd: formOf(signed, await sign((o.key ?? dev).pair.privateKey, signed), photos), signed, photos };
}

/** The identical request again (a retry re-sends the stored payload, signature and photos). */
function formOf(payload: string, signature: string, photos: Uint8Array<ArrayBuffer>[]): FormData {
  const fd = new FormData();
  fd.set('payload', payload);
  fd.set('signature', signature);
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return fd;
}
const resend = (s: Signed, photos = s.photos) => formOf(s.signed, s.fd.get('signature') as string, photos);

function deps(over: Partial<CaptureDeps> = {}): CaptureDeps {
  return { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => RECEIVED, ...over };
}
async function run(fd: FormData, d = deps()) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, d, (e) => events.push(e));
  return events;
}
const n = async (table: string) => Number((await t.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n);
const counts = async () => ({
  harvest_events: await n('harvest_events'),
  media: await n('media'),
  verification_runs: await n('verification_runs'),
  ledger_entries: await n('ledger_entries'),
});
const verdictOf = (events: CaptureEvent[]) => {
  const last = events.at(-1);
  if (last?.t !== 'verdict') throw new Error(`expected a verdict, got ${JSON.stringify(last)}`);
  return last;
};
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

/**
 * Both requests pass the boundary and the replay lookup before either commits: each pauses after storing
 * its first photo until the other has too.
 */
const barrierStore = (): MediaStore => sharedBarrier(t.dir, 2);

describe('TC-040 · EVAL-068 an identical signed payload is idempotent', () => {
  it('the retry of an accepted capture gets the same event and verdict with idempotent:true, writes nothing, and the season counts the kg once', async () => {
    const first = await signedCapture();
    const original = verdictOf(await run(first.fd));
    expect(original.verdict).toBe('Verified');
    const before = await counts();
    expect(before).toEqual({ harvest_events: 1, media: 2, verification_runs: 1, ledger_entries: SEED_ENTRIES + 2 });

    const l = log();
    const again = await run(resend(first), deps({ log: l }));
    expect(again).toEqual([{ ...original, idempotent: true }]); // no check lines: nothing was verified again
    expect(await counts()).toEqual(before);
    expect(l.info).toHaveBeenCalledWith({ eventId: original.eventId }, 'capture.idempotent_replay');
    expect(await seasonCherryKgBefore(t.db, world.plotId, coffeeSeasonOf(RECEIVED.toISOString()))).toBe(42.5);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('CR-005: a replay after an admin override answers with the decided verdict, as the Pickings tab shows it', async () => {
    // Just outside the plot edge: geofence fails (not a hard fail), so the capture is Needs Review.
    const first = await signedCapture({ gps: { lat: Math.round((P01_INSIDE.lat + 0.004) * 1e7) / 1e7, lng: P01_INSIDE.lng } });
    const original = verdictOf(await run(first.fd));
    expect(original.verdict).toBe('Needs Review');
    const run1 = (await t.client.execute({ sql: 'SELECT id FROM verification_runs WHERE event_id = ?', args: [original.eventId] })).rows[0]!.id as string;
    // A raw override row (the service's signing is not under test): the trigger sets final_verdict.
    await t.client.execute({
      sql: `INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq) VALUES ('AO-CR5', ?, ?, 'Rejected', 'Photos are of another farm', 'sig', 'kid', ?, 1)`,
      args: [run1, world.agentId, RECEIVED.toISOString()],
    });
    const again = verdictOf(await run(resend(first)));
    expect(again).toMatchObject({ eventId: original.eventId, verdict: 'Rejected', score: original.score, checks: original.checks, idempotent: true });
  });

  it('the same photos under a new capturedAt (a different payload hash) are processed normally and hard-fail photo_uniqueness', async () => {
    const first = await signedCapture();
    const original = verdictOf(await run(first.fd));
    const reuse = await signedCapture({ photos: first.photos, capturedAt: '2026-10-14T04:12:40.000Z', seq: 2, prevEventHash: await sha256Hex(first.signed) });
    const events = await run(reuse.fd);
    const v = verdictOf(events);
    expect(v.eventId).not.toBe(original.eventId);
    expect(v.idempotent).toBeUndefined();
    expect(v.verdict).toBe('Rejected');
    expect(v.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'fail', evidence: '2 of 2 photos seen before' });
    expect(await n('harvest_events')).toBe(2);
  });

  it('a retry of a boundary-rejected payload whose refusal still applies gets the same rejection, without a second anchor', async () => {
    const s = await signedCapture();
    const wrong = [fakeJpeg('not-what-was-signed'), s.photos[1]!];
    expect(await run(resend(s, wrong))).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    const after = await counts();
    const prior = await findRejection(t.db, await sha256Hex(s.signed), 'media_hash_mismatch');
    expect(prior).toMatch(/^HE-/);
    // the original refusal: its eventId, idempotent (owner decision, TKT-09)
    expect(await run(resend(s, wrong))).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409, eventId: prior, idempotent: true }]);
    expect(await counts()).toEqual(after);
  });

  it('EXE11 · refused for X, then for a different reason Y → a normal new rejection; X again → the original X, idempotent', async () => {
    const s = await signedCapture({ label: 'xyx' });
    const wrong = [fakeJpeg('not-what-was-signed'), s.photos[1]!];
    const ledger = () => n('ledger_entries');

    // X: media_hash_mismatch, anchored
    let l0 = await ledger();
    expect(await run(resend(s, wrong))).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    expect(await ledger()).toBe(l0 + 1);
    const x = await findRejection(t.db, await sha256Hex(s.signed), 'media_hash_mismatch');

    // Y: the plot is un-assigned meanwhile → plot_not_assigned, a new anchored rejection, no idempotent
    await unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    l0 = await ledger();
    expect(await run(resend(s))).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    expect(await ledger()).toBe(l0 + 1);

    // X again (plot assigned again, the same wrong photos) → the original X rejection, nothing new
    await assignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    l0 = await ledger();
    expect(await run(resend(s, wrong))).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409, eventId: x, idempotent: true }]);
    expect(await ledger()).toBe(l0);

    const rows = (await t.client.execute('SELECT id, boundary_status, boundary_reason FROM harvest_events ORDER BY anchor_seq')).rows.map((r) => ({ ...r }));
    expect(rows).toEqual([
      { id: x, boundary_status: 'rejected', boundary_reason: 'media_hash_mismatch' },
      { id: expect.stringMatching(/^HE-/), boundary_status: 'rejected', boundary_reason: 'plot_not_assigned' },
    ]);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });
});

describe('a stored refusal never blocks the genuine capture of the same payload (only accepted short-circuits)', () => {
  it('bad_signature stored first (someone replayed the bytes with a forged signature) → the genuine upload is still accepted', async () => {
    const s = await signedCapture();
    const other = await makeDevice('DV-OTHER000');
    const forged = formOf(s.signed, await sign(other.pair.privateKey, s.signed), s.photos);
    expect(await run(forged)).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
    expect(verdictOf(await run(resend(s))).verdict).toBe('Verified');
    const rows = (await t.client.execute('SELECT boundary_status, boundary_reason FROM harvest_events ORDER BY anchor_seq')).rows.map((r) => ({ ...r }));
    expect(rows).toEqual([
      { boundary_status: 'rejected', boundary_reason: 'bad_signature' },
      { boundary_status: 'accepted', boundary_reason: null },
    ]);
    // and the genuine retry after that is the idempotent replay
    expect((await run(resend(s))).at(-1)).toMatchObject({ t: 'verdict', idempotent: true });
  });

  it('media_hash_mismatch stored first → the resend with the signed bytes is accepted', async () => {
    const s = await signedCapture();
    expect(await run(resend(s, [fakeJpeg('garbled'), s.photos[1]!]))).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    const v = verdictOf(await run(resend(s)));
    expect(v.verdict).toBe('Verified');
    expect(v.checks.find((c) => c.id === 'photo_uniqueness')?.status).toBe('ok');
  });

  it('plot_not_assigned stored first → after the plot is assigned, the identical bytes are accepted', async () => {
    await unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    const s = await signedCapture();
    expect(await run(s.fd)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    await assignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    expect(verdictOf(await run(resend(s))).verdict).toBe('Verified');
  });
});

describe('replay of an accepted payload after later changes (boundary order: signature → ownership → replay → revocation/assignment/media)', () => {
  it('after the phone is revoked, the retry still gets its original verdict and nothing is written', async () => {
    const s = await signedCapture();
    const original = verdictOf(await run(s.fd));
    await revokeDevice(t.db, { deviceId: world.deviceId, adminOrgId: world.orgId });
    const before = await counts();
    expect(await run(resend(s))).toEqual([{ ...original, idempotent: true }]);
    expect(await counts()).toEqual(before);
  });

  it('after the plot is un-assigned, the retry still gets its original verdict', async () => {
    const s = await signedCapture();
    const original = verdictOf(await run(s.fd));
    await unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    expect(await run(resend(s))).toEqual([{ ...original, idempotent: true }]);
  });

  it('still needs a valid signature and the owning agent', async () => {
    const s = await signedCapture();
    verdictOf(await run(s.fd));
    const other = await makeDevice('DV-OTHER000');
    const forged = formOf(s.signed, await sign(other.pair.privateKey, s.signed), s.photos);
    expect(await run(forged)).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
    expect(await run(resend(s), deps({ agentId: 'AG-SOMEONE' }))).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect(await n(`harvest_events WHERE boundary_status = 'accepted'`)).toBe(1);
  });
});

describe('the duplicate-resend race: the loser answers with the winner’s verdict', () => {
  it('two identical submissions in flight at once → exactly one event, both responses carry the same event and verdict', async () => {
    const s = await signedCapture();
    const barrier = barrierStore();
    const [a, b] = await Promise.all([run(s.fd, deps({ media: barrier })), run(resend(s), deps({ media: barrier }))]);
    const va = verdictOf(a);
    const vb = verdictOf(b);
    const strip = (v: typeof va) => ({ eventId: v.eventId, verdict: v.verdict, score: v.score, checks: v.checks });
    expect(strip(vb)).toEqual(strip(va));
    expect([va.idempotent, vb.idempotent].filter(Boolean)).toHaveLength(1); // the loser says it replayed
    expect(va.verdict).toBe('Verified'); // the winner's own photos are not "seen before"
    expect(await counts()).toEqual({ harvest_events: 1, media: 2, verification_runs: 1, ledger_entries: SEED_ENTRIES + 2 });
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('a unique violation on payload_hash in the write transaction → the winner, re-read; any other error is rethrown', async () => {
    const s = await signedCapture();
    const original = verdictOf(await run(s.fd));
    const hash = await sha256Hex(s.signed);
    // The real error: a second ACCEPTED row for the hash, refused by the guard/index.
    let violation: unknown;
    try {
      await writeTx(t.db, async (tx) => {
        const [row] = await tx.select().from(harvestEvents);
        await tx.insert(harvestEvents).values({ ...row!, id: 'HE-DUPLICATE', finalVerdict: null });
      });
    } catch (err) {
      violation = err;
    }
    expect(isUniqueViolation(violation)).toBe(true);
    // answered from the winner, logged with the request id (the request's child logger) and the event id
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const requestLog = createLogger('debug', sink).child({ requestId: 'req-race-1' });
    expect(await winnerAfterUniqueViolation(t.db, hash, violation, requestLog)).toMatchObject({
      kind: 'accepted',
      eventId: original.eventId,
      verdict: original.verdict,
      score: original.score,
    });
    const raced = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === 'capture.idempotent_race');
    expect(raced).toEqual([expect.objectContaining({ requestId: 'req-race-1', eventId: original.eventId })]);

    const quiet = log();
    const other = new Error('disk I/O error');
    expect(isUniqueViolation(other)).toBe(false);
    await expect(winnerAfterUniqueViolation(t.db, hash, other, quiet)).rejects.toBe(other);
    await expect(winnerAfterUniqueViolation(t.db, 'f'.repeat(64), violation, quiet)).rejects.toBe(violation); // no winner on record
    expect(quiet.warn).not.toHaveBeenCalled();
  });

  it('a unique violation from any other table is rethrown even though an accepted winner exists for the hash', async () => {
    const s = await signedCapture();
    verdictOf(await run(s.fd));
    const hash = await sha256Hex(s.signed);
    const refusedBy = async (sql: string): Promise<unknown> => {
      try {
        await writeTx(t.db, async (tx) => {
          await tx.run(sql);
        });
      } catch (err) {
        return err;
      }
      throw new Error(`expected ${sql} to be refused`);
    };
    // the devices no-replace trigger ("UNIQUE: …") and a plain UNIQUE index (ledger entry_hash)
    const deviceReplace = await refusedBy(`INSERT INTO devices SELECT * FROM devices LIMIT 1`);
    const ledgerDuplicate = await refusedBy(`INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash)
      SELECT seq + 1000, prev_hash, kind, payload, payload_hash, ts, entry_hash FROM ledger_entries LIMIT 1`);
    const quiet = log();
    for (const err of [deviceReplace, ledgerDuplicate]) {
      expect(String((err as Error).message) + String((err as Error).cause ?? '')).toMatch(/UNIQUE/);
      expect(isUniqueViolation(err)).toBe(false);
      await expect(winnerAfterUniqueViolation(t.db, hash, err, quiet)).rejects.toBe(err);
    }
    expect(quiet.warn).not.toHaveBeenCalled();
  });
});

// The owner's three guarantees (TKT-09 owner decision on idempotent replay), one test each.
describe('owner guarantees for idempotent replay', () => {
  const seasonKg = () => seasonCherryKgBefore(t.db, world.plotId, coffeeSeasonOf(RECEIVED.toISOString()));

  it('(i) no double-counted kg: identical accepted payloads, sequential and concurrent, count once in the season total', async () => {
    // sequential: the capture and two identical retries
    const a = await signedCapture({ label: 'seq' });
    verdictOf(await run(a.fd));
    for (let i = 0; i < 2; i++) expect((await run(resend(a))).at(-1)).toMatchObject({ idempotent: true });
    expect(await seasonKg()).toBe(42.5);

    // concurrent: two identical copies of a second capture in flight at once
    const b = await signedCapture({ label: 'conc', seq: 2, prevEventHash: await sha256Hex(a.signed), capturedAt: '2026-10-14T04:12:40.000Z' });
    const barrier = barrierStore();
    const [x, y] = await Promise.all([run(b.fd, deps({ media: barrier })), run(resend(b), deps({ media: barrier }))]);
    expect(verdictOf(x).eventId).toBe(verdictOf(y).eventId);
    expect(await seasonKg()).toBe(85);
    expect(await n(`harvest_events WHERE boundary_status = 'accepted'`)).toBe(2);
  });

  it('(ii) no ledger spam: N replays of the same rejected payload with an unchanged reason add zero ledger entries', async () => {
    const N = 5;
    const stranger = await makeDevice('DV-STRANGER');
    const cases: { reason: string; status: number; make: () => Promise<FormData> }[] = [
      {
        reason: 'media_hash_mismatch',
        status: 409,
        make: async () => {
          const s = await signedCapture({ label: 'mm' });
          return resend(s, [fakeJpeg('x'), s.photos[1]!]);
        },
      },
      {
        reason: 'bad_signature',
        status: 401,
        make: async () => {
          const s = await signedCapture({ label: 'bs' });
          return formOf(s.signed, await sign(stranger.pair.privateKey, s.signed), s.photos);
        },
      },
      { reason: 'unknown_device', status: 401, make: async () => (await signedCapture({ label: 'ud', key: stranger, deviceId: randomId('DV-') })).fd },
    ];
    const replayN = async (fd: FormData, reason: string, status: number) => {
      const ledger = await n('ledger_entries');
      const events = await n('harvest_events');
      const [row] = (await t.client.execute({ sql: 'SELECT id FROM harvest_events WHERE boundary_reason = ?', args: [reason] })).rows;
      for (let i = 0; i < N; i++) expect(await run(fd), reason).toEqual([{ t: 'rejected', reason, status, eventId: String(row!.id), idempotent: true }]);
      expect(await n('ledger_entries'), reason).toBe(ledger);
      expect(await n('harvest_events'), reason).toBe(events);
    };
    for (const c of cases) {
      const fd = await c.make();
      expect(await run(fd), c.reason).toEqual([{ t: 'rejected', reason: c.reason, status: c.status }]);
      await replayN(fd, c.reason, c.status);
    }
    await unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
    const pna = await signedCapture({ label: 'pna' });
    expect(await run(pna.fd)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    await replayN(resend(pna), 'plot_not_assigned', 403);
    await revokeDevice(t.db, { deviceId: world.deviceId, adminOrgId: world.orgId });
    const rev = await signedCapture({ label: 'rev' });
    expect(await run(rev.fd)).toEqual([{ t: 'rejected', reason: 'device_revoked', status: 403 }]);
    await replayN(resend(rev), 'device_revoked', 403);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it.each(['unknown_device', 'device_revoked', 'plot_not_assigned'] as const)(
    '(iii) an honest agent is never stuck: a payload rejected as %s and replayed after the cause is fixed is processed and Verified',
    async (reason) => {
      let s: Signed;
      if (reason === 'unknown_device') {
        // A phone the server has not enrolled yet signs a capture; then its key is enrolled to this agent.
        const phone = await makeDevice('unused');
        const deviceId = randomId('DV-');
        s = await signedCapture({ label: 'u', key: phone, deviceId });
        expect(await run(s.fd)).toEqual([{ t: 'rejected', reason, status: 401 }]);
        await writeTx(t.db, async (tx) => {
          const a = await append(tx, 'device_enrolled', { deviceId, agentId: world.agentId });
          await tx.insert(devices).values({
            id: deviceId,
            agentId: world.agentId,
            publicKeyJwk: JSON.stringify(publicMembers(phone.publicJwk)),
            keyThumbprint: `kid-${deviceId}`,
            enrolledAt: RECEIVED.toISOString(),
            anchorSeq: a.seq,
          });
        });
      } else if (reason === 'device_revoked') {
        await revokeDevice(t.db, { deviceId: world.deviceId, adminOrgId: world.orgId });
        s = await signedCapture({ label: 'r' });
        expect(await run(s.fd)).toEqual([{ t: 'rejected', reason, status: 403 }]);
        // The product has no un-revoke (a phone is re-enrolled with a new key, and its new captures are new
        // payloads); lifting the cause here shows the stored refusal itself never blocks the payload.
        await t.client.execute({ sql: 'UPDATE devices SET revoked_at = NULL WHERE id = ?', args: [world.deviceId] });
      } else {
        await unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
        s = await signedCapture({ label: 'p' });
        expect(await run(s.fd)).toEqual([{ t: 'rejected', reason, status: 403 }]);
        await assignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: world.orgId });
      }
      const v = verdictOf(await run(resend(s)));
      expect(v.verdict).toBe('Verified');
      expect(v.idempotent).toBeUndefined();
      const rows = (await t.client.execute('SELECT boundary_status, boundary_reason FROM harvest_events ORDER BY anchor_seq')).rows.map((r) => ({ ...r }));
      expect(rows).toEqual([
        { boundary_status: 'rejected', boundary_reason: reason },
        { boundary_status: 'accepted', boundary_reason: null },
      ]);
    },
  );
});

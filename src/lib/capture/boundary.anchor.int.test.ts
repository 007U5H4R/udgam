import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { verifyChain } from '../ledger/hashchain';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { runCapture, type CaptureDeps, type CaptureEvent } from './pipeline';

// TSK-19.4 (Solution-PRD §7 rule 2, TP7): once a payload's signature verifies, a refusal of its upload
// is anchored as a rejected harvest_event plus its ledger entry, in one transaction, once. An unsigned
// or garbled request writes nothing and leaves one `capture.refused` log line with the reason.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
const SEED_ENTRIES = 2;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
});
afterEach(async () => {
  await t.cleanup();
});

const TEXT = new TextEncoder().encode('a text file, not a photo');

async function signedForm(photos: Uint8Array<ArrayBuffer>[], o: { key?: TestDevice } = {}) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const s = jcs(payload);
  const fd = new FormData();
  fd.set('payload', s);
  fd.set('signature', await sign((o.key ?? dev).pair.privateKey, s));
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return { fd, signed: s };
}

function deps(log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }): CaptureDeps & { log: typeof log } {
  return { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => new Date('2026-10-14T04:12:34.000Z'), log };
}

async function run(fd: FormData, d = deps()) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, d, (e) => events.push(e));
  return events;
}

const q = async (sql: string) => (await t.client.execute(sql)).rows.map((r) => ({ ...r }));
const n = async (table: string) => Number((await t.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n);

/** The one rejected row and its ledger entry: same transaction means the entry is the row's anchor. */
async function anchoredRejection(signed: string) {
  const [ev] = await q(`SELECT * FROM harvest_events`);
  expect(ev).toBeDefined();
  expect(ev!.payload_hash).toBe(await sha256Hex(signed));
  const [entry] = await q(`SELECT kind, payload FROM ledger_entries WHERE seq = ${Number(ev!.anchor_seq)}`);
  return { ev: ev!, entry: { kind: entry!.kind, payload: JSON.parse(String(entry!.payload)) as Record<string, unknown> } };
}

describe('signed refusals are anchored (TSK-19.4)', () => {
  it.each([
    ['media_type', 415, async () => signedForm([TEXT])],
    ['media_type', 415, async () => signedForm([fakeJpeg('ok'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])])],
    [
      'media_hash_mismatch',
      409,
      async () => {
        const f = await signedForm([fakeJpeg('signed')]);
        f.fd.set('photo0', new File([fakeJpeg('other')], 'p0.jpg', { type: 'image/jpeg' }));
        return f;
      },
    ],
    [
      'media_too_large',
      413,
      async () => {
        const big = new Uint8Array(10 * 1024 * 1024 + 1);
        big.set([0xff, 0xd8, 0xff, 0xe0]);
        return signedForm([big]);
      },
    ],
  ] as const)('%s → %i, one rejected harvest_event and its ledger entry', async (reason, status, make) => {
    const { fd, signed } = await make();
    const d = deps();
    expect(await run(fd, d)).toEqual([{ t: 'rejected', reason, status }]);
    const { ev, entry } = await anchoredRejection(signed);
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: reason, device_id: world.deviceId, agent_id: world.agentId, final_verdict: null });
    expect(entry).toEqual({
      kind: 'harvest_event',
      payload: expect.objectContaining({ boundaryStatus: 'rejected', boundaryReason: reason, deviceId: world.deviceId, plotId: world.plotId }),
    });
    expect(await n('ledger_entries')).toBe(SEED_ENTRIES + 1);
    expect(await n('media')).toBe(0);
    expect(await n('verification_runs')).toBe(0);
    expect(d.log.info).toHaveBeenCalledWith({ reason, status, anchored: true }, 'capture.refused');
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('a retry of the same signed payload gets the same rejection without a second anchor (TP7)', async () => {
    const { fd } = await signedForm([TEXT]);
    expect(await run(fd)).toEqual([{ t: 'rejected', reason: 'media_type', status: 415 }]);
    const [first] = await q('SELECT id FROM harvest_events');
    // the original refusal, with its event id (owner decision on replay, TKT-09)
    expect(await run(fd)).toEqual([{ t: 'rejected', reason: 'media_type', status: 415, eventId: first!.id, idempotent: true }]);
    expect(await n('harvest_events')).toBe(1);
    expect(await n('ledger_entries')).toBe(SEED_ENTRIES + 1);
  });

  it("a refused upload of another agent's phone is not anchored (device_not_owned)", async () => {
    const { fd } = await signedForm([TEXT]);
    expect(await run(fd, { ...deps(), agentId: 'U-SOMEONE-ELSE' })).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect(await n('harvest_events')).toBe(0);
  });
});

describe('unsigned or garbled requests are only logged (TSK-19.4)', () => {
  const cases: [string, string, number, () => Promise<FormData>][] = [
    [
      'no signature field',
      'bad_form',
      400,
      async () => {
        const { fd } = await signedForm([fakeJpeg('a')]);
        fd.delete('signature');
        return fd;
      },
    ],
    [
      'a payload that is not JSON',
      'bad_schema',
      400,
      async () => {
        const { fd } = await signedForm([fakeJpeg('a')]);
        fd.set('payload', '{"v":1,');
        return fd;
      },
    ],
    [
      'a non-canonical payload',
      'non_canonical',
      400,
      async () => {
        const { fd, signed } = await signedForm([fakeJpeg('a')]);
        fd.set('payload', JSON.stringify(JSON.parse(signed), null, 2));
        return fd;
      },
    ],
    [
      'a text photo under a signature that does not verify',
      'media_type',
      415,
      async () => (await signedForm([TEXT], { key: await makeDevice('K-X') })).fd,
    ],
    [
      'a text photo claiming a phone that was never enrolled',
      'media_type',
      415,
      async () => {
        const { fd, signed } = await signedForm([TEXT]);
        const p = { ...(JSON.parse(signed) as CapturePayloadV1), deviceId: 'DV-NEVER0000'.slice(0, 11) };
        fd.set('payload', jcs(p));
        return fd;
      },
    ],
  ];

  it.each(cases)('%s → %s %i: no row, no ledger entry, one capture.refused line', async (_label, reason, status, make) => {
    const d = deps();
    const events = await run(await make(), d);
    expect(events).toMatchObject([{ t: 'rejected', reason, status }]);
    expect(await n('harvest_events')).toBe(0);
    expect(await n('ledger_entries')).toBe(SEED_ENTRIES);
    expect(d.log.info).toHaveBeenCalledTimes(1);
    expect(d.log.info).toHaveBeenCalledWith(expect.objectContaining({ reason, status, anchored: false }), 'capture.refused');
  });
});

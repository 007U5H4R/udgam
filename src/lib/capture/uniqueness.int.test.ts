import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { runCapture, type CaptureEvent } from './pipeline';

// TC-042 (TSK-09.5, EVAL-030–032): photo_uniqueness is global over ACCEPTED captures — any agent, any plot,
// whatever the final verdict (a photo used on an event Rejected by a check was still used). A photo that
// only ever reached a boundary-rejected event does not count as seen, so an honest retake after a refusal
// is not punished. Agent B's world (another agent, device and plot) is written directly in SQL.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld; // agent A, plot P01, A's phone

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  await t.client.executeMultiple(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, org_id) VALUES ('AG-B', 'Agent B', 'b@x.test', 1, 0, 0, 'agent', '${world.orgId}');
    INSERT INTO plots (id, farmer_id, crop, geojson, area_ha, anchor_seq, created_at, updated_at) VALUES ('PL-P03', '${world.farmerId}', 'arabica', '{}', 5.5, 1, '${TS}', '${TS}');
    INSERT INTO devices (id, agent_id, public_key_jwk, key_thumbprint, enrolled_at, anchor_seq) VALUES ('DV-B0000001', 'AG-B', '{}', 'kid-b', '${TS}', 1);
  `);
});
afterEach(async () => {
  await t.cleanup();
});

const TS = '2026-10-01T00:00:00.000Z';
let k = 0;

/** Agent B's event on P03 carrying `photos`; accepted ones get a run with `verdict` (final_verdict by trigger). */
async function agentBEvent(photos: Uint8Array[], o: { status: 'accepted' | 'rejected'; verdict?: 'Verified' | 'Rejected' }) {
  k += 1;
  const id = `HE-B${k}`;
  await t.client.execute({
    sql: `INSERT INTO harvest_events (id, plot_id, device_id, agent_id, seq, server_received_at, cherry_kg, payload, payload_hash, signature, boundary_status, boundary_reason, anchor_seq)
          VALUES (?, 'PL-P03', 'DV-B0000001', 'AG-B', ?, ?, 40, '{}', ?, 'sig', ?, ?, 1)`,
    args: [id, k, TS, `b${k}`.padEnd(64, '0'), o.status, o.status === 'rejected' ? 'media_hash_mismatch' : null],
  });
  for (const [i, bytes] of photos.entries()) {
    const sha = await sha256Hex(bytes);
    await t.client.execute({ sql: `INSERT INTO media (id, event_id, path, sha256, size, mime) VALUES (?, ?, ?, ?, ?, 'image/jpeg')`, args: [`${id}-m${i}`, id, `media/${sha}.jpg`, sha, bytes.length] });
  }
  if (o.status === 'accepted') {
    await t.client.execute({
      sql: `INSERT INTO verification_runs (id, event_id, run_no, verdict, score, checks, unavailable_providers, config_version, config_hash, created_at, anchor_seq)
            VALUES (?, ?, 1, ?, 90, '[]', '[]', 'cfg-1', ?, ?, 1)`,
      args: [`VR-B${k}`, id, o.verdict ?? 'Verified', 'c'.repeat(64), TS],
    });
  }
}

/** Agent A's signed capture on P01 with `photos`. */
async function captureA(photos: Uint8Array<ArrayBuffer>[]) {
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
  fd.set('signature', await sign(dev.pair.privateKey, s));
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  const events: CaptureEvent[] = [];
  await runCapture(fd, { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => new Date('2026-10-14T04:12:34.000Z') }, (e) => events.push(e));
  const last = events.at(-1);
  if (last?.t !== 'verdict') throw new Error(`expected a verdict, got ${JSON.stringify(last)}`);
  return { verdict: last.verdict, uniqueness: last.checks.find((c) => c.id === 'photo_uniqueness') };
}

const photos3 = (label: string) => [fakeJpeg(`${label}-1`), fakeJpeg(`${label}-2`), fakeJpeg(`${label}-3`)];

describe('photo_uniqueness across agents and plots (TC-042)', () => {
  it('EVAL-031/032: one photo already on agent B’s accepted event on another plot → hard fail "1 of 3 photos seen before"', async () => {
    const mine = photos3('a');
    await agentBEvent([mine[1]!], { status: 'accepted' });
    expect(await captureA(mine)).toEqual({ verdict: 'Rejected', uniqueness: { id: 'photo_uniqueness', status: 'fail', evidence: '1 of 3 photos seen before', hardFail: true } });
  });

  it('EVAL-030: all three reused → "3 of 3 photos seen before"', async () => {
    const mine = photos3('b');
    await agentBEvent(mine, { status: 'accepted' });
    expect((await captureA(mine)).uniqueness).toMatchObject({ status: 'fail', evidence: '3 of 3 photos seen before' });
  });

  it('a photo only on a boundary-rejected event is not "seen": the honest retake is accepted', async () => {
    const mine = photos3('c');
    await agentBEvent(mine, { status: 'rejected' });
    expect(await captureA(mine)).toEqual({ verdict: 'Verified', uniqueness: { id: 'photo_uniqueness', status: 'ok', evidence: '3 of 3 photos are new', hardFail: false } });
  });

  it('a photo on an event Rejected by a check (still boundary-accepted) counts as seen: it was used', async () => {
    const mine = photos3('d');
    await agentBEvent([mine[0]!], { status: 'accepted', verdict: 'Rejected' });
    expect((await t.client.execute(`SELECT final_verdict FROM harvest_events WHERE plot_id = 'PL-P03'`)).rows[0]?.final_verdict).toBe('Rejected');
    expect((await captureA(mine)).uniqueness).toMatchObject({ status: 'fail', evidence: '1 of 3 photos seen before' });
  });
});

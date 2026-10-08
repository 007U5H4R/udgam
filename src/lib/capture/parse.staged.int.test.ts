import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { parseCaptureForm } from './parse';
import { runCapture, type CaptureDeps, type CaptureEvent } from './pipeline';
import { deviceKey } from './rate-limit';
import { localStagingStore, stagePhoto, STAGE_TTL_MS, type StagingStore } from './staging';

// TSK-30.3 · TC-094 (a–c): a capture may name photos it staged earlier (form field `staged`, a JSON array
// of sha256) instead of sending their bytes. The staged bytes pass the same size, type and hash checks as
// uploaded ones; a staged photo that is missing, expired, or another agent's or phone's answers 409
// media_not_staged (nothing anchored: the phone resends the bytes); so is one changed on disk (EXE25: only
// the server can have changed it, so it is discarded and the phone resends, never an anchored refusal). After COMMIT the staged copies are in the media store and their rows
// are gone. A capture that sends every photo's bytes is unchanged (TC-043, pipeline.int.test.ts).

const NOW = new Date('2026-10-14T04:12:34.000Z');
let t: TempDb;
let staging: StagingStore;

beforeEach(async () => {
  t = await tempDb();
  staging = localStagingStore(t.dir);
});
afterEach(async () => {
  await t.cleanup();
});

type World = { world: TracerWorld; dev: TestDevice };

async function newWorld(db = t.db): Promise<World> {
  const dev = await makeDevice();
  return { world: await seedTracerWorld(db, { publicJwk: dev.publicJwk }), dev };
}

/** A signed capture of `photos`; `send` says which photos go as bytes (the rest are listed in `staged`). */
async function form(w: World, photos: Uint8Array<ArrayBuffer>[], o: { staged?: number[]; stagedField?: string } = {}) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: w.world.plotId,
    deviceId: w.world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', signed);
  fd.set('signature', await sign(w.dev.pair.privateKey, signed));
  const staged = new Set(o.staged ?? []);
  let k = 0;
  photos.forEach((b, i) => {
    if (!staged.has(i)) fd.set(`photo${k++}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' }));
  });
  if (o.stagedField !== undefined) fd.set('staged', o.stagedField);
  else if (staged.size > 0) fd.set('staged', JSON.stringify([...staged].map((i) => payload.media[i]!.sha256)));
  return { fd, payload };
}

function deps(w: World, over: Partial<CaptureDeps> = {}, db = t.db, dir = t.dir): CaptureDeps {
  return { db, media: localMediaStore(dir), staging: localStagingStore(dir), agentId: w.world.agentId, now: () => NOW, ...over };
}

async function run(fd: FormData, d: CaptureDeps) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, d, (e) => events.push(e));
  return events;
}

const stage = (w: World, bytes: Uint8Array, now = new Date(NOW.getTime() - 5 * 60_000), deviceId = w.world.deviceId) =>
  stagePhoto(t.db, staging, { agentId: w.world.agentId, deviceId, bytes, mime: 'image/jpeg', now });

const n = async (client: TempDb['client'], sql: string) => Number((await client.execute(sql)).rows[0]?.n);

describe('captures with staged photos (TC-094)', () => {
  it('TC-094 (a) three staged photos and no file parts: the same verdict and stored media as an all-bytes capture; staged rows and files gone after COMMIT', async () => {
    const w = await newWorld();
    const photos = [fakeJpeg('s-a'), fakeJpeg('s-b'), fakeJpeg('s-c')];
    for (const p of photos) await stage(w, p);
    const { fd } = await form(w, photos, { staged: [0, 1, 2] });
    expect([...fd.keys()].filter((k) => k.startsWith('photo'))).toEqual([]);
    const events = await run(fd, deps(w));
    const verdict = events.at(-1)!;
    expect(verdict).toMatchObject({ t: 'verdict' });

    // the same bytes, sent as file parts, in a fresh world
    const other = await tempDb();
    try {
      const w2 = await newWorld(other.db);
      const { fd: plain } = await form(w2, photos);
      const plainEvents = await run(plain, deps(w2, {}, other.db, other.dir));
      const strip = (e: CaptureEvent) => (e.t === 'verdict' ? { verdict: e.verdict, score: e.score, checks: e.checks.map((c) => [c.id, c.status]) } : e);
      expect(strip(verdict)).toEqual(strip(plainEvents.at(-1)!));
      const mediaRows = async (c: TempDb['client']) =>
        (await c.execute('SELECT sha256, size, mime, path FROM media ORDER BY sha256')).rows.map((r) => ({ ...r }));
      expect(await mediaRows(t.client)).toEqual(await mediaRows(other.client));
    } finally {
      await other.cleanup();
    }
    for (const p of photos) {
      const sha = await sha256Hex(p);
      expect(existsSync(join(t.dir, 'media', sha.slice(0, 2), `${sha}.jpg`))).toBe(true);
      expect(existsSync(join(t.dir, 'staging', w.world.agentId, sha))).toBe(false);
    }
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM staged_media')).toBe(0);
  });

  it('TC-094 (a) staged and uploaded photos together cover payload.media in order', async () => {
    const w = await newWorld();
    const photos = [fakeJpeg('m-a'), fakeJpeg('m-b'), fakeJpeg('m-c')];
    await stage(w, photos[1]!);
    const { fd } = await form(w, photos, { staged: [1] });
    expect([...fd.keys()].filter((k) => k.startsWith('photo'))).toEqual(['photo0', 'photo1']);
    const events = await run(fd, deps(w));
    expect(events.at(-1)).toMatchObject({ t: 'verdict' });
    const shas = (await t.client.execute('SELECT m.sha256 FROM media m ORDER BY m.rowid')).rows.map((r) => r.sha256);
    expect(shas).toEqual(await Promise.all(photos.map((p) => sha256Hex(p))));
  });

  it('TC-094 (b) a staged file changed on disk → 409 media_not_staged naming it, nothing anchored; it is discarded and the resend is accepted (EXE25)', async () => {
    const w = await newWorld();
    const photos = [fakeJpeg('t-a'), fakeJpeg('t-b')];
    for (const p of photos) await stage(w, p);
    const changed = await sha256Hex(photos[1]!);
    await writeFile(join(t.dir, 'staging', w.world.agentId, changed), fakeJpeg('t-b-edited'));
    const ledger = await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries');
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { fd } = await form(w, photos, { staged: [0, 1] });
    const events = await run(fd, deps(w, { log: log as unknown as CaptureDeps['log'] }));
    expect(events).toEqual([{ t: 'rejected', reason: 'media_not_staged', status: 409, missing: [changed] }]);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM harvest_events')).toBe(0);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries')).toBe(ledger);
    // the changed copy is gone (row and file); the intact one stays for the resend to use
    expect((await t.client.execute('SELECT sha256 FROM staged_media')).rows.map((r) => r.sha256)).toEqual([await sha256Hex(photos[0]!)]);
    expect(existsSync(join(t.dir, 'staging', w.world.agentId, changed))).toBe(false);
    expect(log.warn).toHaveBeenCalledWith({ reason: 'hash_mismatch' }, 'stage.integrity_failed');

    const { fd: resend } = await form(w, photos, { staged: [0] });
    expect((await run(resend, deps(w))).at(-1)).toMatchObject({ t: 'verdict' });
  });

  it('the media_not_staged round spends no rate-limit token: only the resend counts (TKT-30 review #5)', async () => {
    const w = await newWorld();
    const photo = fakeJpeg('refund');
    const { fd } = await form(w, [photo], { staged: [0] }); // never staged
    expect(await run(fd, deps(w))).toMatchObject([{ t: 'rejected', reason: 'media_not_staged', status: 409 }]);
    const tokens = async () =>
      Number((await t.client.execute({ sql: 'SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits WHERE key = ?', args: [deviceKey(w.world.agentId, w.world.deviceId)] })).rows[0]?.n);
    expect(await tokens()).toBe(0);
    const { fd: resend } = await form(w, [photo]);
    expect((await run(resend, deps(w))).at(-1)).toMatchObject({ t: 'verdict' });
    expect(await tokens()).toBe(1);
  });

  it('TC-094 (c) agent B naming agent A’s staged photo → 409 media_not_staged with the missing hashes; nothing anchored', async () => {
    const a = await newWorld();
    const b = await newWorld();
    const photo = fakeJpeg('a-only');
    await stage(a, photo);
    const ledger = await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries');
    const { fd } = await form(b, [photo], { staged: [0] });
    const events = await run(fd, deps(b));
    expect(events).toEqual([{ t: 'rejected', reason: 'media_not_staged', status: 409, missing: [await sha256Hex(photo)] }]);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM harvest_events')).toBe(0);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries')).toBe(ledger);
    // agent A's staged copy is untouched
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM staged_media')).toBe(1);
  });

  it('TC-094 (c) an expired staged photo, or one staged by another phone, → 409 media_not_staged; a resend with the bytes is accepted', async () => {
    const w = await newWorld();
    const photos = [fakeJpeg('e-a'), fakeJpeg('e-b')];
    await stage(w, photos[0]!, new Date(NOW.getTime() - STAGE_TTL_MS - 1000)); // expired by NOW
    await stage(w, photos[1]!, undefined, 'DV-ZZZZZZZZ'); // the agent's other phone
    const { fd } = await form(w, photos, { staged: [0, 1] });
    const events = await run(fd, deps(w));
    expect(events).toEqual([{ t: 'rejected', reason: 'media_not_staged', status: 409, missing: await Promise.all(photos.map((p) => sha256Hex(p))) }]);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM harvest_events')).toBe(0);

    const { fd: resend } = await form(w, photos);
    expect((await run(resend, deps(w))).at(-1)).toMatchObject({ t: 'verdict' });
  });

  it('without a staging store every staged photo is missing (409), never a refusal', async () => {
    const w = await newWorld();
    const photo = fakeJpeg('no-store');
    await stage(w, photo);
    const { fd } = await form(w, [photo], { staged: [0] });
    const events = await run(fd, deps(w, { staging: undefined }));
    expect(events).toMatchObject([{ t: 'rejected', reason: 'media_not_staged', status: 409 }]);
  });

  it('a resend of an accepted capture that names its (now consumed) staged photos gets the original verdict', async () => {
    const w = await newWorld();
    const photo = fakeJpeg('replayed');
    await stage(w, photo);
    const { fd } = await form(w, [photo], { staged: [0] });
    const first = await run(fd, deps(w));
    expect(first.at(-1)).toMatchObject({ t: 'verdict' });
    const again = await run(fd, deps(w));
    expect(again.at(-1)).toMatchObject({ t: 'verdict', idempotent: true });
  });

  it('a malformed `staged` field, or a staged hash the payload does not list → 400 bad_form (not anchored)', async () => {
    const w = await newWorld();
    const photo = fakeJpeg('bad-field');
    await stage(w, photo);
    const ledger = await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries');
    for (const stagedField of ['not json', '{}', '["ABC"]', JSON.stringify(['f'.repeat(64)]), JSON.stringify([]), JSON.stringify(Array(4).fill('a'.repeat(64)))]) {
      const { fd } = await form(w, [photo], { staged: [0], stagedField });
      expect(await run(fd, deps(w)), stagedField).toEqual([{ t: 'rejected', reason: 'bad_form', status: 400 }]);
    }
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM harvest_events')).toBe(0);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM ledger_entries')).toBe(ledger);
  });

  it('a staged file that is no longer a JPEG no longer hashes either: 409 media_not_staged, nothing anchored (EXE25)', async () => {
    const w = await newWorld();
    const photo = fakeJpeg('typed');
    await stage(w, photo);
    await writeFile(join(t.dir, 'staging', w.world.agentId, await sha256Hex(photo)), 'plain text now');
    const { fd } = await form(w, [photo], { staged: [0] });
    expect(await run(fd, deps(w))).toEqual([{ t: 'rejected', reason: 'media_not_staged', status: 409, missing: [await sha256Hex(photo)] }]);
    expect(await n(t.client, 'SELECT COUNT(*) AS n FROM harvest_events')).toBe(0);
  });

  it('staged photos count towards the 1–3 photo limit (media_count)', async () => {
    const w = await newWorld();
    const photos = [fakeJpeg('c-a'), fakeJpeg('c-b'), fakeJpeg('c-c')];
    await stage(w, photos[0]!);
    const { fd } = await form(w, photos, { staged: [0] });
    fd.set('photo2', new File([fakeJpeg('c-d')], 'd.jpg'));
    expect(await parseCaptureForm(fd, { loadStaged: async () => new Map() })).toMatchObject({ ok: false, status: 400, reason: 'media_count' });
  });
});

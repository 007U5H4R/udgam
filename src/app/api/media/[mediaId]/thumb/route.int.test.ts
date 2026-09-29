// @vitest-environment node
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../../../../scripts/tracer-world';
import { addOrg, addUser, cookieHeader } from '../../../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../../../tests/helpers/db';
import { makeDevice } from '../../../../../../tests/helpers/verify';
import { persistAccepted } from '../../../../../lib/capture/persist';
import { jcs, sha256Hex } from '../../../../../lib/crypto';
import { writeTx } from '../../../../../lib/db/client';
import { canReadMedia } from '../../../../../lib/media/access';
import { localMediaStore } from '../../../../../lib/media/store';

// TSK-10.13: photo thumbnails for the agent who took them and the FPO's admins only; never the original.

const PASSWORD = 'thumb test password';
const PHOTO = readFileSync('assets/demo-photos/branch-01.jpg'); // AI-generated demo photo (TP29)

let t: TempDb;
let world: TracerWorld;
let mediaId: string;

beforeEach(async () => {
  t = await tempDb();
  const dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');

  const sha = await sha256Hex(new Uint8Array(PHOTO));
  const { path } = await localMediaStore(t.dir).put(new Uint8Array(PHOTO), sha, 'image/jpeg');
  const payload = {
    v: 1 as const,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 40,
    media: [{ sha256: sha, size: PHOTO.length, mime: 'image/jpeg' }],
  };
  const payloadString = jcs(payload);
  await writeTx(t.db, (tx) =>
    persistAccepted(tx, {
      payload,
      payloadString,
      payloadHash: 'b'.repeat(64),
      signature: 'x',
      serverReceivedAt: new Date().toISOString(),
      device: { id: world.deviceId, agentId: world.agentId, publicJwk: dev.publicJwk, revokedAt: null, lastSeq: 0, lastEventHash: null },
      media: [{ sha256: sha, size: PHOTO.length, mime: 'image/jpeg', path, exif: { gps: null, takenAt: null, hadOffset: false } }],
      result: { verdict: 'Verified', score: 95, checks: [], unavailableProviders: [], capReasons: [], config: { version: 'cfg-1', hash: '0'.repeat(64) } },
    }),
  );
  mediaId = (await t.client.execute('SELECT id FROM media LIMIT 1')).rows[0]!.id as string;
});
afterEach(async () => {
  (await import('../../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function signIn(email: string): Promise<string> {
  const { appAuth } = await import('../../../../_auth/auth');
  const res = await appAuth().api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(res.status).toBe(200);
  return cookieHeader(res);
}

async function get(cookie: string | null, id = mediaId): Promise<Response> {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/api/media/${id}/thumb`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ mediaId: id }) });
}

describe('GET /api/media/[mediaId]/thumb', () => {
  it("agent A reads their own photo's thumbnail: a private-cached JPEG of at most 320 px, never the original bytes", async () => {
    const res = await get(await signIn(world.agentEmail));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(PHOTO)).toBe(false);
    expect(body.length).toBeLessThan(PHOTO.length);
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(320);
    // the second request reads the cached thumbnail, identical
    expect(Buffer.from(await (await get(await signIn(world.agentEmail))).arrayBuffer()).equals(body)).toBe(true);
  });

  it('agent B of the same FPO gets 404; an admin of the FPO 200; an admin of another FPO 404; a buyer 403; signed out 401', async () => {
    await addUser(t.db, { id: 'U-AGENT-B', email: 'b@thumb.test', password: PASSWORD, role: 'agent', orgId: world.orgId });
    await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin-a@thumb.test', password: PASSWORD, role: 'admin', orgId: world.orgId });
    await addOrg(t.db, 'ORG-OTHER', 'fpo');
    await addUser(t.db, { id: 'U-ADMIN-X', email: 'admin-x@thumb.test', password: PASSWORD, role: 'admin', orgId: 'ORG-OTHER' });
    await addOrg(t.db, 'ORG-BUYER', 'buyer');
    await addUser(t.db, { id: 'U-BUYER', email: 'buyer@thumb.test', password: PASSWORD, role: 'buyer', orgId: 'ORG-BUYER' });

    expect((await get(await signIn('b@thumb.test'))).status).toBe(404);
    expect((await get(await signIn('admin-a@thumb.test'))).status).toBe(200);
    const other = await get(await signIn('admin-x@thumb.test'));
    expect(other.status).toBe(404);
    const unknown = await get(await signIn('admin-a@thumb.test'), 'ME-UNKNOWN0000');
    expect(await other.text()).toBe(await unknown.text()); // another org's photo looks like no photo
    expect((await get(await signIn('buyer@thumb.test'))).status).toBe(403);
    expect((await get(null)).status).toBe(401);
  });
});

describe('GET /api/media/[mediaId]/thumb failures (TASK-11 fix round 1)', () => {
  it('stored bytes sharp cannot decode: 200 with the 320 px placeholder, not an error', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    mkdirSync(join(t.dir, 'junk'), { recursive: true });
    writeFileSync(join(t.dir, 'junk', 'x.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    await t.client.execute({ sql: 'UPDATE media SET path = ?, sha256 = ? WHERE id = ?', args: ['junk/x.jpg', 'c'.repeat(64), mediaId] });
    const res = await get(await signIn(world.agentEmail));
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 320, 320]);
  });

  it('a stored path outside the data directory is a server error (500, logged), never a read and never a 404', async () => {
    await t.client.execute({ sql: 'UPDATE media SET path = ?, sha256 = ? WHERE id = ?', args: ['../outside.jpg', 'd'.repeat(64), mediaId] });
    const res = await get(await signIn(world.agentEmail));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'thumb_failed' });
  });

  it('a missing original is a server error (500), not a 404', async () => {
    await t.client.execute({ sql: 'UPDATE media SET path = ?, sha256 = ? WHERE id = ?', args: ['gone/none.jpg', 'e'.repeat(64), mediaId] });
    expect((await get(await signIn(world.agentEmail))).status).toBe(500);
  });
});

describe('canReadMedia', () => {
  it('never lets a buyer read a photo, even of their own org id', async () => {
    const { db } = t;
    expect(await canReadMedia(db, { userId: world.agentId, orgId: world.orgId, role: 'agent' }, mediaId)).toMatchObject({ id: mediaId });
    expect(await canReadMedia(db, { userId: 'X', orgId: world.orgId, role: 'buyer' }, mediaId)).toBeNull();
    expect(await canReadMedia(db, { userId: world.agentId, orgId: 'ORG-ELSEWHERE', role: 'agent' }, mediaId)).toBeNull();
  });
});

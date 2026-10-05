// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedTracerWorld, type TracerWorld } from '../../../../../scripts/tracer-world';
import { addOrg, addUser, cookieHeader } from '../../../../../tests/helpers/auth';
import { fakeJpeg } from '../../../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import { makeDevice } from '../../../../../tests/helpers/verify';
import { sha256Hex } from '../../../../lib/crypto';

// TSK-30.2 · TC-093: POST /api/capture/stage takes one photo (the raw image as the body) from a signed-in
// agent's enrolled phone. TKT-19's boundary rules hold: the per-address and per-agent limits apply before
// any slot or body read; Content-Length is capped before the body is read; the bytes are sniffed (AVIF
// refused) and must be the declared type; writes go through writeTx; nothing is anchored.

let t: TempDb;
let world: TracerWorld;
let agentCookie: string;
const PASSWORD = 'tracer agent password';

beforeEach(async () => {
  t = await tempDb();
  world = await seedTracerWorld(t.db, { publicJwk: (await makeDevice()).publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  agentCookie = await signIn(world.agentEmail);
});
afterEach(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const { appAuth } = await import('../../../_auth/auth');
  const res = await appAuth().api.signInEmail({ body: { email, password }, asResponse: true });
  expect(res.status).toBe(200);
  return cookieHeader(res);
}

type Opts = { cookie?: string | null; type?: string; device?: string | null; length?: string | null; ip?: string };

function stageRequest(bytes: Uint8Array<ArrayBuffer>, o: Opts = {}): Request {
  const headers: Record<string, string> = { 'content-type': o.type ?? 'image/jpeg', 'x-forwarded-for': o.ip ?? '203.0.113.7' };
  const cookie = o.cookie === undefined ? agentCookie : o.cookie;
  if (cookie) headers.cookie = cookie;
  const device = o.device === undefined ? world.deviceId : o.device;
  if (device) headers['x-udgam-device'] = device;
  const length = o.length === undefined ? String(bytes.length) : o.length;
  if (length !== null) headers['content-length'] = length;
  return new Request('http://localhost/api/capture/stage', { method: 'POST', body: bytes, headers });
}

/** A request whose body records whether anything read it (the checks that must come first). */
function untouchedBody(o: Opts & { length: string }): { req: Request; read: () => boolean } {
  let pulled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled = true;
      c.enqueue(fakeJpeg('streamed'));
      c.close();
    },
  }, { highWaterMark: 0 }); // pulled only when something reads the body
  const headers: Record<string, string> = { 'content-type': 'image/jpeg', 'content-length': o.length, 'x-forwarded-for': o.ip ?? '203.0.113.7' };
  headers.cookie = o.cookie ?? agentCookie;
  headers['x-udgam-device'] = world.deviceId;
  const req = new Request('http://localhost/api/capture/stage', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  return { req, read: () => pulled };
}

const count = async (table: string) => Number((await t.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n);

describe('POST /api/capture/stage (TC-093)', () => {
  it('TC-093 an agent session + JPEG → 201 {sha256, expiresAt}; the stored bytes hash to it; nothing is anchored', async () => {
    const { POST } = await import('./route');
    const before = await count('ledger_entries');
    const bytes = fakeJpeg('route-1');
    const res = await POST(stageRequest(bytes));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { sha256: string; expiresAt: string };
    expect(body.sha256).toBe(await sha256Hex(bytes));
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(59 * 60_000);
    const stored = readFileSync(join(t.dir, 'staging', world.agentId, body.sha256));
    expect(await sha256Hex(new Uint8Array(stored))).toBe(body.sha256);
    expect(await count('ledger_entries')).toBe(before);
    expect(await count('media')).toBe(0);
  });

  it('TC-093 no session → 401; an admin or a buyer → 403', async () => {
    const { POST } = await import('./route');
    expect((await POST(stageRequest(fakeJpeg('x'), { cookie: null }))).status).toBe(401);
    await addUser(t.db, { id: 'AD-STAGE', email: 'admin@stage.test', password: PASSWORD, role: 'admin', orgId: world.orgId });
    expect((await POST(stageRequest(fakeJpeg('x'), { cookie: await signIn('admin@stage.test') }))).status).toBe(403);
    await addOrg(t.db, 'ORG-BUY', 'buyer');
    await addUser(t.db, { id: 'BU-STAGE', email: 'buyer@stage.test', password: PASSWORD, role: 'buyer', orgId: 'ORG-BUY' });
    expect((await POST(stageRequest(fakeJpeg('x'), { cookie: await signIn('buyer@stage.test') }))).status).toBe(403);
    expect(await count('staged_media')).toBe(0);
  });

  it('TC-093 a text file sent as a JPEG → 415; AVIF sent as HEIC → 415; a type that is not a photo → 415', async () => {
    const { POST } = await import('./route');
    expect((await POST(stageRequest(new TextEncoder().encode('hello, not a photo')))).status).toBe(415);
    const avif = new Uint8Array(32);
    avif.set([0, 0, 0, 24], 0);
    avif.set(new TextEncoder().encode('ftypmif1\0\0\0\0avif'), 4);
    expect((await POST(stageRequest(avif, { type: 'image/heic' }))).status).toBe(415);
    expect((await POST(stageRequest(fakeJpeg('as-png'), { type: 'image/png' }))).status).toBe(415);
    expect(await count('staged_media')).toBe(0);
  });

  it('TC-093 10 MB + 1 → 413 from Content-Length, before the body is read; no Content-Length → 411', async () => {
    const { POST } = await import('./route');
    const big = untouchedBody({ length: String(10 * 1024 * 1024 + 1) });
    const res = await POST(big.req);
    expect(res.status).toBe(413);
    expect(big.read()).toBe(false);
    expect((await POST(stageRequest(fakeJpeg('no-length'), { length: null }))).status).toBe(411);
  });

  it('a body longer than its Content-Length claims is refused at the cap', async () => {
    const { POST } = await import('./route');
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    expect((await POST(stageRequest(big, { length: '100' }))).status).toBe(413);
  });

  it('TC-093 the 13th unexpired photo → 429', async () => {
    const { POST } = await import('./route');
    for (let i = 0; i < 12; i++) expect((await POST(stageRequest(fakeJpeg(`r-${i}`)))).status).toBe(201);
    const res = await POST(stageRequest(fakeJpeg('r-12')));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many' });
  });

  it('TC-093 60 stage calls per agent per 10 min: the 61st → 429 with Retry-After, before the body is read', async () => {
    const { POST } = await import('./route');
    const { consume } = await import('../../../../lib/capture/rate-limit');
    const { STAGE_AGENT_LIMIT, stageAgentKey } = await import('../../../../lib/capture/staging');
    expect(STAGE_AGENT_LIMIT).toEqual({ limit: 60, windowSec: 600 });
    for (let i = 0; i < 60; i++) await consume(t.db, stageAgentKey(world.agentId), 60, 600);
    const r = untouchedBody({ length: '20' });
    const res = await POST(r.req);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(r.read()).toBe(false);
  });

  it('the per-address limit answers 429 with Retry-After before the body is read', async () => {
    const { POST } = await import('./route');
    const { consume } = await import('../../../../lib/capture/rate-limit');
    const { STAGE_IP_LIMIT, stageIpKey } = await import('../../../../lib/capture/staging');
    for (let i = 0; i < STAGE_IP_LIMIT.limit; i++) await consume(t.db, stageIpKey('198.51.100.4'), STAGE_IP_LIMIT.limit, STAGE_IP_LIMIT.windowSec);
    const r = untouchedBody({ length: '20', ip: '198.51.100.4' });
    const res = await POST(r.req);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(r.read()).toBe(false);
  });

  it('TC-093 each call sweeps expired staged photos first (file and row)', async () => {
    const { POST } = await import('./route');
    const old = 'a'.repeat(64);
    await mkdir(join(t.dir, 'staging', world.agentId), { recursive: true });
    await writeFile(join(t.dir, 'staging', world.agentId, old), fakeJpeg('old'));
    await t.client.execute({
      sql: `INSERT INTO staged_media (sha256, agent_id, device_id, size, mime, path, created_at, expires_at) VALUES (?, ?, ?, 10, 'image/jpeg', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z')`,
      args: [old, world.agentId, world.deviceId, join('staging', world.agentId, old)],
    });
    // even a refused upload sweeps
    expect((await POST(stageRequest(new TextEncoder().encode('not a photo')))).status).toBe(415);
    expect(await count('staged_media')).toBe(0);
    expect(existsSync(join(t.dir, 'staging', world.agentId, old))).toBe(false);
  });

  it("refuses a phone that is not the agent's or is revoked (403), and a missing phone id (400)", async () => {
    const { POST } = await import('./route');
    expect((await POST(stageRequest(fakeJpeg('x'), { device: 'DV-ZZZZZZZZ' }))).status).toBe(403);
    expect((await POST(stageRequest(fakeJpeg('x'), { device: null }))).status).toBe(400);
    await t.client.execute({ sql: `UPDATE devices SET revoked_at = '2026-01-01T00:00:00.000Z' WHERE id = ?`, args: [world.deviceId] });
    const res = await POST(stageRequest(fakeJpeg('x')));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'device_revoked' });
    expect(await count('staged_media')).toBe(0);
  });

  it('declares the Node runtime and no caching', async () => {
    const mod = await import('./route');
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});

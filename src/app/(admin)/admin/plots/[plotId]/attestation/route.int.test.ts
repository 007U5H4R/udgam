// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../../../../tests/helpers/auth';
import { multipartRequest } from '../../../../../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../../../../../tests/helpers/db';
import type { Role } from '../../../../../../lib/auth/session';
import { attestations, ledgerEntries } from '../../../../../../lib/db/schema';
import type { PlotPolygon } from '../../../../../../lib/geo/types';

// TSK-13.2 / TC-058: the attach route and the download route. Admin only (401 signed out, 403 for an
// agent or a buyer), the org from the session, another org's plot and attestation are the same 404
// as an unknown one (EVAL-080), the upload is capped before its body is read, and a certificate file that
// changed on disk is never served as the recorded one.

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const P01 = (JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'evals', 'fixtures', 'plots', 'P01.geojson'), 'utf8')) as { geometry: PlotPolygon }).geometry;
const PASSWORD = 'attestation route password';
const PDF = new TextEncoder().encode('%PDF-1.7\nNPOP certificate\n%%EOF\n');

let t: TempDb;
const cookies: Partial<Record<Role | 'adminB', string>> = {};
let plotA: string;
let plotA2: string;
let plotB: string;

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-B', 'fpo');
  await addOrg(t.db, 'ORG-BUY', 'buyer');
  const { appAuth } = await import('../../../../../_auth/auth');
  const users = [
    ['agent', 'agent', 'ORG-A'],
    ['admin', 'admin', 'ORG-A'],
    ['buyer', 'buyer', 'ORG-BUY'],
    ['adminB', 'admin', 'ORG-B'],
  ] as const;
  for (const [key, role, orgId] of users) {
    await addUser(t.db, { id: `U-${key}`, email: `${key.toLowerCase()}@a.test`, password: PASSWORD, role, orgId });
    cookies[key] = cookieHeader(await appAuth().api.signInEmail({ body: { email: `${key.toLowerCase()}@a.test`, password: PASSWORD }, asResponse: true }));
  }
  const { registerPlot, setOnPlotGeometrySaved } = await import('../../../../../../lib/plots/plots');
  setOnPlotGeometrySaved(async () => undefined);
  const reg = (orgId: string, name: string) => registerPlot(t.db, orgId, { newFarmer: { name, identifier: null }, crop: 'arabica', geometry: P01 });
  plotA = (await reg('ORG-A', 'Farmer A')).plotId;
  plotA2 = (await reg('ORG-A', 'Farmer A2')).plotId;
  plotB = (await reg('ORG-B', 'Farmer B')).plotId;
}, 30_000);
afterEach(async () => {
  (await import('../../../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

const fields = (over: Record<string, string | File | null> = {}) => {
  const fd = new FormData();
  const all: Record<string, string | File | null> = {
    issuer: 'INDOCERT',
    validFrom: '2026-01-01',
    validTo: '2027-01-01',
    file: new File([PDF], 'npop.pdf', { type: 'application/pdf' }),
    ...over,
  };
  for (const [k, v] of Object.entries(all)) if (v !== null) fd.set(k, v);
  return fd;
};

const post = async (who: Role | 'adminB' | null, plotId: string, fd: FormData = fields(), extra: Record<string, string> = {}) => {
  const { POST } = await import('./route');
  const req = await multipartRequest(`http://localhost/admin/plots/${plotId}/attestation`, fd, { ...(who ? { cookie: cookies[who]! } : {}), ...extra });
  return POST(req, { params: Promise.resolve({ plotId }) });
};

const get = async (who: Role | 'adminB' | null, plotId: string, attestationId: string) => {
  const { GET } = await import('./[attestationId]/route');
  const req = new Request(`http://localhost/admin/plots/${plotId}/attestation/${attestationId}`, { headers: who ? { cookie: cookies[who]! } : {} });
  return GET(req, { params: Promise.resolve({ plotId, attestationId }) });
};

const ledgerCount = async () => (await t.db.select().from(ledgerEntries)).length;

describe('POST /admin/plots/[plotId]/attestation', () => {
  it('is 401 signed out and 403 for an agent or a buyer; nothing is stored or anchored', async () => {
    const before = await ledgerCount();
    expect((await post(null, plotA)).status).toBe(401);
    expect((await post('agent', plotA)).status).toBe(403);
    expect((await post('buyer', plotA)).status).toBe(403);
    expect(await t.db.select().from(attestations)).toEqual([]);
    expect(await ledgerCount()).toBe(before);
  });

  it('an admin attaches a PDF: 201 with the attestation ID, the row and its anchor on record', async () => {
    const res = await post('admin', plotA);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { ok: true; id: string };
    expect(body).toEqual({ ok: true, id: expect.stringMatching(/^AT-[0-9A-Z]{8}$/) });
    const [row] = await t.db.select().from(attestations);
    expect(row).toMatchObject({ id: body.id, plotId: plotA, issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-01-01', fileHash: createHash('sha256').update(PDF).digest('hex') });
  });

  it('refuses with a reason and stores nothing: not a PDF, bad dates, no issuer, no file', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], 'cert.pdf', { type: 'application/pdf' });
    const cases: [FormData, number, string][] = [
      [fields({ file: png }), 422, 'not_pdf'],
      [fields({ validTo: '2025-12-31' }), 422, 'bad_dates'],
      [fields({ validFrom: '2026-02-30' }), 422, 'bad_dates'],
      [fields({ issuer: '  ' }), 422, 'issuer_required'],
      [fields({ issuer: null }), 422, 'issuer_required'],
      [fields({ file: null }), 400, 'no_file'],
      [fields({ file: new File([], 'empty.pdf') }), 400, 'no_file'],
    ];
    for (const [fd, status, reason] of cases) {
      const res = await post('admin', plotA, fd);
      expect([res.status, await res.json()], reason).toEqual([status, { ok: false, reason }]);
    }
    expect(await t.db.select().from(attestations)).toEqual([]);
  });

  it("another org's plot and an unknown plot answer the same 404 (EVAL-080)", async () => {
    const other = await post('admin', plotB);
    const unknown = await post('admin', 'PL-00000000');
    const malformed = await post('admin', 'not-a-plot');
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ ok: false, reason: 'plot_not_found' });
    expect([unknown.status, await unknown.json()]).toEqual([404, { ok: false, reason: 'plot_not_found' }]);
    expect([malformed.status, await malformed.json()]).toEqual([404, { ok: false, reason: 'plot_not_found' }]);
    expect(await t.db.select().from(attestations)).toEqual([]);
  });

  it('a body above 10 MB is refused by its Content-Length before it is read (413)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/admin/plots/${plotA}/attestation`, {
        method: 'POST',
        headers: { cookie: cookies.admin!, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(10 * 1024 * 1024 + 70 * 1024) },
        body: 'never read',
      }),
      { params: Promise.resolve({ plotId: plotA }) },
    );
    expect([res.status, await res.json()]).toEqual([413, { ok: false, reason: 'too_large' }]);
  });

  it('a request without Content-Length is 411 and a cross-site browser request is 403', async () => {
    const { POST } = await import('./route');
    const noLength = await POST(new Request(`http://localhost/x`, { method: 'POST', headers: { cookie: cookies.admin! }, body: '' }), { params: Promise.resolve({ plotId: plotA }) });
    expect(noLength.status).toBe(411);
    const cross = await post('admin', plotA, fields(), { 'sec-fetch-site': 'cross-site' });
    expect([cross.status, await cross.json()]).toEqual([403, { ok: false, reason: 'not_allowed' }]);
    expect((await post('admin', plotA, fields(), { 'sec-fetch-site': 'same-origin' })).status).toBe(201);
    expect(await t.db.select().from(attestations)).toHaveLength(1);
  });
});

describe('GET /admin/plots/[plotId]/attestation/[attestationId]', () => {
  async function attach(plotId = plotA) {
    return ((await (await post('admin', plotId)).json()) as { id: string }).id;
  }

  it('is 401 signed out and 403 for an agent or a buyer', async () => {
    const id = await attach();
    expect((await get(null, plotA, id)).status).toBe(401);
    expect((await get('agent', plotA, id)).status).toBe(403);
    expect((await get('buyer', plotA, id)).status).toBe(403);
  });

  it('an admin downloads the exact bytes as an attachment, with hardening headers', async () => {
    const id = await attach();
    const res = await get('admin', plotA, id);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="certificate-${id}.pdf"`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it("another org's admin, an unknown ID and the wrong plot all get the same 404 body", async () => {
    const id = await attach();
    const answers = [await get('adminB', plotA, id), await get('adminB', plotB, id), await get('admin', plotA, 'AT-00000000'), await get('admin', plotA2, id), await get('admin', plotA, 'nope')];
    for (const r of answers) expect(r.status).toBe(404);
    const bodies = await Promise.all(answers.map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
  });

  it('a file changed on disk is not served as the recorded certificate', async () => {
    const id = await attach();
    const [row] = await t.db.select().from(attestations);
    writeFileSync(join(t.dir, row!.filePath), '%PDF-1.7\nforged\n');
    const res = await get('admin', plotA, id);
    expect([res.status, await res.json()]).toEqual([500, { error: 'file_changed' }]);
  });
});

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import { ledgerEntries, plots } from '../../../../lib/db/schema';
import type { Role } from '../../../../lib/auth/session';

// TSK-06.4: the register, edit and upload Server Actions. Guarded (a non-admin gets 403; the static
// tests/guard-coverage.test.ts must keep passing), org from the session, zod input, uploads capped at
// 2 MB, a geometry refusal answers its reason, and success returns the anchored plot's ID.

const request = vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
  return { headers: new Headers() };
});
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const FIXTURES = join(__dirname, '..', '..', '..', '..', '..', 'evals', 'fixtures');
const fixture = (p: string) => readFileSync(join(FIXTURES, p), 'utf8');
const P01 = JSON.stringify((JSON.parse(fixture('plots/P01.geojson')) as { geometry: unknown }).geometry);

let t: TempDb;
const PASSWORD = 'plots action password';
const cookies: Partial<Record<Role | 'adminB', string>> = {};

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-B', 'fpo');
  await addOrg(t.db, 'ORG-BUY', 'buyer');
  const { appAuth } = await import('../../../_auth/auth');
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
});
afterEach(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  request.headers = new Headers();
  await t.cleanup();
});

const as = (who: Role | 'adminB' | null) => {
  request.headers = new Headers(who ? { cookie: cookies[who]! } : {});
};

const form = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const actions = () => import('./actions');

describe('guards', () => {
  it('every action: 401 signed out, 403 for an agent or a buyer, and nothing is written', async () => {
    const a = await actions();
    for (const who of [null, 'agent', 'buyer'] as const) {
      as(who);
      const status = who ? 403 : 401;
      await expect(a.createPlotAction(form({ newFarmerName: 'X', crop: 'arabica', geojson: P01 }))).rejects.toMatchObject({ status });
      await expect(a.updatePlotGeometryAction('PL-00000000', P01)).rejects.toMatchObject({ status });
      await expect(a.uploadPlotFileAction(form({ newFarmerName: 'X', crop: 'arabica', file: new File([P01], 'p.geojson') }))).rejects.toMatchObject({ status });
    }
    expect(await t.db.select().from(ledgerEntries)).toEqual([]);
  });
});

describe('createPlotAction', () => {
  it('registers a plot for a new farmer and anchors it', async () => {
    const { createPlotAction } = await actions();
    as('admin');
    const r = await createPlotAction(form({ newFarmerName: 'Kaveri Appaiah', newFarmerIdentifier: 'KGU-7', crop: 'arabica', geojson: P01 }));
    expect(r).toEqual({ ok: true, plotId: expect.stringMatching(/^PL-/) });
    const [entry] = await t.db.select().from(ledgerEntries);
    expect(entry!.kind).toBe('plot_registered');
    const [row] = await t.db.select().from(plots);
    expect(row!.id).toBe((r as { plotId: string }).plotId);
    expect(Math.abs(row!.areaHa - 2) / 2).toBeLessThan(0.005);
  });

  it('an existing farmer of the org; another org cannot use that farmer', async () => {
    const { createPlotAction } = await actions();
    as('admin');
    const first = await createPlotAction(form({ newFarmerName: 'Kaveri', crop: 'arabica', geojson: P01 }));
    const { farmerId } = (await t.db.select().from(plots))[0]!;
    const second = await createPlotAction(form({ farmerId, crop: 'robusta', geojson: P01 }));
    expect(second.ok).toBe(true);
    expect(first.ok).toBe(true);
    as('adminB');
    expect(await createPlotAction(form({ farmerId, crop: 'robusta', geojson: P01 }))).toEqual({ ok: false, reason: 'farmer_not_found' });
  });

  it('an invalid geometry answers its reason and writes nothing', async () => {
    const { createPlotAction } = await actions();
    as('admin');
    expect(await createPlotAction(form({ newFarmerName: 'K', crop: 'arabica', geojson: fixture('geometry/bowtie.geojson') }))).toEqual({ ok: false, reason: 'self_intersection' });
    expect(await createPlotAction(form({ newFarmerName: 'K', crop: 'arabica', geojson: fixture('geometry/open-ring.geojson') }))).toEqual({ ok: false, reason: 'open_ring' });
    expect(await t.db.select().from(ledgerEntries)).toEqual([]);
  });

  it('bad input (unknown crop, no farmer, a client-sent area is ignored) → invalid_input', async () => {
    const { createPlotAction } = await actions();
    as('admin');
    expect(await createPlotAction(form({ newFarmerName: 'K', crop: 'liberica', geojson: P01 }))).toEqual({ ok: false, reason: 'invalid_input' });
    expect(await createPlotAction(form({ crop: 'arabica', geojson: P01 }))).toEqual({ ok: false, reason: 'invalid_input' });
    const r = await createPlotAction(form({ newFarmerName: 'K', crop: 'arabica', geojson: P01, areaHa: '99' }));
    expect(r.ok).toBe(true);
    expect((await t.db.select().from(plots))[0]!.areaHa).toBeLessThan(3);
  });
});

describe('updatePlotGeometryAction', () => {
  it('re-anchors as plot_edited; another org gets not_found', async () => {
    const { createPlotAction, updatePlotGeometryAction } = await actions();
    as('admin');
    const r = (await createPlotAction(form({ newFarmerName: 'K', crop: 'arabica', geojson: P01 }))) as { ok: true; plotId: string };
    const moved = fixture('geometry/valid-polygon.geojson');
    as('adminB');
    expect(await updatePlotGeometryAction(r.plotId, moved)).toEqual({ ok: false, reason: 'not_found' });
    as('admin');
    expect(await updatePlotGeometryAction(r.plotId, moved)).toEqual({ ok: true, plotId: r.plotId });
    expect((await t.db.select().from(ledgerEntries)).map((e) => e.kind)).toEqual(['plot_registered', 'plot_edited']);
    expect((await t.db.select().from(plots))[0]!.registrationStale).toBe(1);
    expect(await updatePlotGeometryAction(r.plotId, fixture('geometry/bowtie.geojson'))).toEqual({ ok: false, reason: 'self_intersection' });
  });
});

describe('uploadPlotFileAction', () => {
  it('a file over 2 MB → file_too_large, without reading it into a plot', async () => {
    const { uploadPlotFileAction } = await actions();
    as('admin');
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.geojson');
    expect(await uploadPlotFileAction(form({ newFarmerName: 'K', crop: 'arabica', file: big }))).toEqual({ ok: false, reason: 'file_too_large' });
    expect(await t.db.select().from(ledgerEntries)).toEqual([]);
  });

  it('a KML upload registers the plot; an invalid file answers its reason', async () => {
    const { uploadPlotFileAction } = await actions();
    as('admin');
    const kml = new File([fixture('geometry/one-placemark.kml')], 'one-placemark.kml', { type: 'application/vnd.google-earth.kml+xml' });
    expect(await uploadPlotFileAction(form({ newFarmerName: 'K', crop: 'robusta', file: kml }))).toEqual({ ok: true, plotId: expect.stringMatching(/^PL-/) });
    const projected = new File([fixture('geometry/projected.geojson')], 'projected.geojson');
    expect(await uploadPlotFileAction(form({ newFarmerName: 'K', crop: 'robusta', file: projected }))).toEqual({ ok: false, reason: 'not_wgs84' });
    expect(await uploadPlotFileAction(form({ newFarmerName: 'K', crop: 'robusta' }))).toEqual({ ok: false, reason: 'no_file' });
  });

  it('with a plotId the upload replaces that plot’s boundary (plot_edited)', async () => {
    const { createPlotAction, uploadPlotFileAction } = await actions();
    as('admin');
    const r = (await createPlotAction(form({ newFarmerName: 'K', crop: 'arabica', geojson: P01 }))) as { ok: true; plotId: string };
    const file = new File([fixture('geometry/valid-multipolygon.geojson')], 'two-parts.geojson');
    expect(await uploadPlotFileAction(form({ plotId: r.plotId, file }))).toEqual({ ok: true, plotId: r.plotId });
    expect((await t.db.select().from(ledgerEntries)).map((e) => e.kind)).toEqual(['plot_registered', 'plot_edited']);
  });
});

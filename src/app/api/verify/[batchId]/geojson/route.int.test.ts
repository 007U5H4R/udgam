// @vitest-environment node
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../../../tests/helpers/db';
import type { CertificateWorld } from '../../../../../lib/certificate/__fixtures__/world';

// TSK-17.2 · TC-070 (route half) · EVAL-078 · TC-067 GeoJSON part (EVAL-084, EV16) · TP8: the EUDR map
// file is served behind the certificate hash. The right `h` answers 200 with the GeoJSON media type, an
// attachment filename and exactly the builder's FeatureCollection; an unknown batch, a missing `h` and a
// wrong `h` answer the feed route's 404, byte for byte. Farmers seeded with sentinel names, identifiers
// and an office phone never reach the file. A 50-plot batch stays far under the EU's 25 MB per-DDS limit.

const SENTINELS = { name: 'Zzsentinel Farmer', identifier: 'ID-SENTINEL-9999', phone: '9999988888' } as const;
const BASE = 'https://udgam.test';

let t: TempDb;
let w: CertificateWorld;
let big: CertificateWorld;

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  vi.stubEnv('PUBLIC_BASE_URL', BASE);
  const { seedCertificateWorld } = await import('../../../../../lib/certificate/__fixtures__/world');
  w = await seedCertificateWorld(t.db, {
    events: 3,
    plots: 2,
    attestation: true,
    transfer: true,
    farmer: () => ({ name: SENTINELS.name, identifier: SENTINELS.identifier }),
    officePhone: SENTINELS.phone,
  });
  big = await seedCertificateWorld(t.db, { events: 50, plots: 50 });
}, 180_000);

afterAll(async () => {
  (await import('../../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function get(route: 'geojson' | 'feed', batchId: string, query: string) {
  const mod = route === 'geojson' ? await import('./route') : await import('../route');
  const path = route === 'geojson' ? `/api/verify/${batchId}/geojson` : `/api/verify/${batchId}`;
  const res = await mod.GET(new Request(`http://localhost${path}${query}`), { params: Promise.resolve({ batchId }) });
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) };
}

async function expected(world: CertificateWorld) {
  const { resolveFeed } = await import('../../../../../lib/ledger/feed');
  const { buildEudrGeoJson } = await import('../../../../../lib/eudr/geojson');
  const feed = await resolveFeed(t.db, world.batchId, world.shortHash);
  return buildEudrGeoJson(feed!, BASE);
}

describe('GET /api/verify/[batchId]/geojson (TC-070 route half, EVAL-078)', () => {
  it('the right h: 200, application/geo+json, an attachment named udgam-{batchId}-eudr.geojson, the builder output', async () => {
    const ok = await get('geojson', w.batchId, `?h=${w.shortHash}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/geo+json');
    expect(ok.headers['content-disposition']).toBe(`attachment; filename="udgam-${w.batchId}-eudr.geojson"`);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(ok.body)).toEqual(await expected(w));
    const fc = JSON.parse(ok.body) as { type: string; features: { properties: { ProducerName: string } }[] };
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.map((f) => f.properties.ProducerName)).toEqual(w.producerIds);
  });

  it('unknown batch, missing h and wrong h: the feed route’s 404, byte for byte (TP8)', async () => {
    const wrong = w.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    const queries: [string, string][] = [
      ['B-UNKNOWN0', `?h=${w.shortHash}`],
      [w.batchId, ''],
      [w.batchId, `?h=${wrong}`],
      // an all-digit short hash has no upper-case variant (it would be the right h)
      ...(w.shortHash.toUpperCase() !== w.shortHash ? [[w.batchId, `?h=${w.shortHash.toUpperCase()}`] as [string, string]] : []),
      [w.batchId, '?h='],
    ];
    const feed404 = await get('feed', 'B-UNKNOWN0', `?h=${w.shortHash}`);
    expect(feed404.status).toBe(404);
    for (const [batchId, q] of queries) {
      const a = await get('geojson', batchId, q);
      expect(a.status, `${batchId}${q}`).toBe(404);
      expect(a.body).toBe(feed404.body);
      expect(a.headers).toEqual(feed404.headers);
    }
  });

  it('TC-067 GeoJSON part (EVAL-084): no farmer name, identifier or phone; producer IDs only', async () => {
    const { body } = await get('geojson', w.batchId, `?h=${w.shortHash}`);
    for (const s of Object.values(SENTINELS)) expect(body).not.toContain(s);
    expect(body.toLowerCase()).not.toContain('zzsentinel');
    for (const p of w.producerIds) expect(body).toContain(`"ProducerName":"${p}"`);
  });

  it('a 50-plot batch: one Feature per plot and far under the EU 25 MB per-DDS limit', async () => {
    const ok = await get('geojson', big.batchId, `?h=${big.shortHash}`);
    expect(ok.status).toBe(200);
    const fc = JSON.parse(ok.body) as { features: unknown[] };
    expect(fc.features).toHaveLength(50);
    expect(Buffer.byteLength(ok.body)).toBeLessThan(25 * 1024 * 1024);
  });
});

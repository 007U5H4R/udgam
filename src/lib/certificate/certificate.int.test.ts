// @vitest-environment node
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import type { CertificateWorld } from './__fixtures__/world';

// TC-068 (integration half) · TP16 · CF-11: the certificate's view model is one pure function of the
// feed, so a database column that no ledger payload reflects cannot change the page: the farmer's name
// and identifier, the organisation's name, and the plot's current polygon and area in the plots table
// (the page draws the polygon anchored in the ledger).

let t: TempDb;
let w: CertificateWorld;

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  const { seedCertificateWorld } = await import('./__fixtures__/world');
  w = await seedCertificateWorld(t.db, { events: 3, plots: 2, attestation: true, transfer: true });
}, 60_000);

afterAll(async () => {
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function view() {
  const { resolveFeed } = await import('../ledger/feed');
  const { buildCertificateView } = await import('./view-model');
  const feed = await resolveFeed(t.db, w.batchId, w.shortHash);
  expect(feed).not.toBeNull();
  return { feed: feed!, view: buildCertificateView(feed!) };
}

describe('the certificate reads the feed, not the tables (TC-068)', () => {
  it('changing unanchored columns leaves the feed and every displayed fact unchanged', async () => {
    const { farmers, organisations, plots } = await import('../db/schema');
    const before = await view();
    expect(before.view.headline).toMatchObject({ quantityKg: w.totalKg, farmCount: 2, district: 'Kodagu' });

    const plotRows = await t.db.select({ farmerId: plots.farmerId }).from(plots).where(inArray(plots.id, w.plotIds));
    await t.db.update(farmers).set({ name: 'Renamed Farmer', identifier: 'ID-CHANGED' }).where(inArray(farmers.id, plotRows.map((r) => r.farmerId)));
    await t.db.update(organisations).set({ name: 'Renamed FPO' }).where(eq(organisations.id, w.orgId));
    const moved = { type: 'Polygon', coordinates: [[[76, 13], [76.01, 13], [76.01, 13.01], [76, 13]]] };
    await t.db.update(plots).set({ geojson: JSON.stringify(moved), areaHa: 99 }).where(eq(plots.id, w.plotIds[0]!));

    const after = await view();
    expect(after.feed).toEqual(before.feed);
    expect(after.view).toEqual(before.view);
    expect(JSON.stringify(after.view)).not.toMatch(/Renamed|ID-CHANGED|"areaHa":99/);
  });
});

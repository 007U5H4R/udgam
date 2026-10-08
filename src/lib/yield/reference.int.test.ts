import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { prepareDatabase } from '../db/migrate';
import { seedYieldReference, YIELD_REFERENCE_VERSION } from '../db/seed/yield-reference';
import { getYieldReference } from './reference';

// TC-039 (TSK-09.1, TP6, technical-plan §6.6): crop_yield_reference is seeded from the cited Coffee Board
// figures — clean-coffee district maxima Arabica 783 and Robusta 1,494 kg/ha (Database on Coffee, July
// 2024, Tables 1.10–1.11) — with the 6:1 fresh-cherry-to-clean ratio recorded as an unverified estimate.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const rows = async () => (await t.client.execute('SELECT * FROM crop_yield_reference ORDER BY crop, variety')).rows.map((r) => ({ ...r }));

describe('seedYieldReference (TC-039)', () => {
  it('writes one row per crop with the TP6 values, a cited source and the reference version', async () => {
    await seedYieldReference(t.db);
    const all = await rows();
    expect(all.map((r) => r.crop)).toEqual(['arabica', 'robusta']);
    const [arabica, robusta] = all;
    expect(arabica).toMatchObject({ max_kg_ha: 783, version: YIELD_REFERENCE_VERSION, source_url: 'https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf' });
    expect(robusta).toMatchObject({ max_kg_ha: 1494, version: YIELD_REFERENCE_VERSION, source_url: 'https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf' });
    for (const r of all) {
      expect(r.cherry_to_clean_ratio).toBeCloseTo(0.1667, 4);
      expect(r.cherry_to_clean_ratio).toBe(1 / 6);
      expect(String(r.source)).toContain('Database on Coffee, July 2024');
      expect(String(r.source)).toContain('Tables 1.10–1.11');
      expect(String(r.source)).toMatch(/unverified/);
    }
    expect(YIELD_REFERENCE_VERSION).toMatch(/\S/);
  });

  it('is idempotent: seeding twice leaves the same two rows', async () => {
    await seedYieldReference(t.db);
    const once = await rows();
    await seedYieldReference(t.db);
    expect(await rows()).toEqual(once);
  });

  it('getYieldReference(crop) returns the seeded row, and null when there is none', async () => {
    expect(await getYieldReference(t.db, 'arabica')).toBeNull();
    await seedYieldReference(t.db);
    expect(await getYieldReference(t.db, 'arabica')).toEqual({
      maxKgHa: 783,
      cherryToCleanRatio: 1 / 6,
      source: expect.stringContaining('Coffee Board'),
      sourceUrl: 'https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf',
      version: YIELD_REFERENCE_VERSION,
    });
    expect(await getYieldReference(t.db, 'robusta')).toMatchObject({ maxKgHa: 1494 });
  });
});

describe('boot (migrateAtBoot → prepareDatabase)', () => {
  it('migrates and seeds the reference, so a fresh server never runs without it', async () => {
    const migrations = fileURLToPath(new URL('../db/migrations', import.meta.url));
    await prepareDatabase(t.db, migrations);
    await prepareDatabase(t.db, migrations);
    expect((await rows()).map((r) => [r.crop, r.max_kg_ha, r.version])).toEqual([
      ['arabica', 783, YIELD_REFERENCE_VERSION],
      ['robusta', 1494, YIELD_REFERENCE_VERSION],
    ]);
  });
});

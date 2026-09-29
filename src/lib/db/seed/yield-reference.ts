import { sql } from 'drizzle-orm';
import { writeTx, type Db } from '../client';
import { YIELD_REFERENCE_ROWS } from '../../yield/reference-data';
import { cropYieldReference } from '../schema';

// Seeds the season yield reference rows (technical-plan §6.6, TP6 — resolves GAP-3; TKT-09; the values
// are in src/lib/yield/reference-data.ts). Reference data, not provenance: seeded idempotently at boot
// (migrateAtBoot) and by the seed scripts; the upsert rewrites the rows when the version changes.

export { CHERRY_TO_CLEAN_RATIO, YIELD_REFERENCE_ROWS, YIELD_REFERENCE_VERSION, YIELD_SOURCE_URL } from '../../yield/reference-data';

/** Insert or refresh the reference rows. Idempotent. */
export async function seedYieldReference(db: Db): Promise<void> {
  await writeTx(db, async (tx) => {
    for (const row of YIELD_REFERENCE_ROWS) {
      await tx
        .insert(cropYieldReference)
        .values(row)
        .onConflictDoUpdate({
          target: [cropYieldReference.crop, cropYieldReference.variety],
          set: {
            minKgHa: sql`excluded.min_kg_ha`,
            maxKgHa: sql`excluded.max_kg_ha`,
            cherryToCleanRatio: sql`excluded.cherry_to_clean_ratio`,
            source: sql`excluded.source`,
            sourceUrl: sql`excluded.source_url`,
            version: sql`excluded.version`,
          },
        });
    }
  });
}

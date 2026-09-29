import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { cropYieldReference } from '../db/schema';

// Reads the season yield reference (technical-plan §6.6, TP6). One row per crop (variety `all`) until
// per-variety or per-plot references exist (roadmap).

export type Crop = 'arabica' | 'robusta';

export type YieldReference = { maxKgHa: number; cherryToCleanRatio: number; source: string; sourceUrl: string; version: string };

/** The crop's reference row, or null when none is seeded (yield_plausibility is then `unavailable`). */
export async function getYieldReference(handle: Db | Tx, crop: Crop): Promise<YieldReference | null> {
  const [row] = await handle
    .select({
      maxKgHa: cropYieldReference.maxKgHa,
      cherryToCleanRatio: cropYieldReference.cherryToCleanRatio,
      source: cropYieldReference.source,
      sourceUrl: cropYieldReference.sourceUrl,
      version: cropYieldReference.version,
    })
    .from(cropYieldReference)
    .where(and(eq(cropYieldReference.crop, crop), eq(cropYieldReference.variety, 'all')));
  return row ?? null;
}

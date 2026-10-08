import { asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { farmers } from '../db/schema';
import { newId } from '../ids';

// Farmers of an FPO (TSK-06.3). Name and identifier stay inside the organisation; the random
// producer ID (`PR-` + 8 Crockford base32) is the only farmer ID that is ever public (EV16), so ledger
// payloads carry it and nothing else about the farmer.

export type NewFarmer = { orgId: string; name: string; identifier?: string | null };

/** Insert a farmer inside the caller's write transaction. */
export async function createFarmer(tx: Tx, { orgId, name, identifier = null }: NewFarmer): Promise<{ id: string; producerId: string }> {
  const row = { id: newId('FA-'), producerId: newId('PR-') };
  await tx.insert(farmers).values({ ...row, orgId, name, identifier });
  return row;
}

export type FarmerOption = { id: string; name: string; producerId: string };

/** The org's farmers, by name (for the new-plot picker). */
export async function listFarmers(db: Db, orgId: string): Promise<FarmerOption[]> {
  return db
    .select({ id: farmers.id, name: farmers.name, producerId: farmers.producerId })
    .from(farmers)
    .where(eq(farmers.orgId, orgId))
    .orderBy(asc(farmers.name), asc(farmers.id));
}

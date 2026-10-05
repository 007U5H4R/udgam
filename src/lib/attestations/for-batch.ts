import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { attestations, batchEvents, batches, farmers, harvestEvents, plots } from '../db/schema';
import type { AttestationRecord } from './attach';

// The organic line on the batch detail pages (QA-P5-2, TC-058): for each member plot of a batch, its
// latest attestation (by anchor), read the same way as the plot page's. Only attestations on plots of the
// batch's own org count, so another org's certificate never shows. The caller has already scoped the
// batch to the viewer (an admin's org, or the buyer that holds it).

/** The batch's member plots that have an attestation on record, each mapped to its latest one. */
export async function batchAttestations(db: Db, batchId: string): Promise<Map<string, AttestationRecord>> {
  const rows = await db
    .selectDistinct({
      id: attestations.id,
      plotId: attestations.plotId,
      fileHash: attestations.fileHash,
      issuer: attestations.issuer,
      validFrom: attestations.validFrom,
      validTo: attestations.validTo,
      anchorSeq: attestations.anchorSeq,
    })
    .from(batchEvents)
    .innerJoin(batches, eq(batches.id, batchEvents.batchId))
    .innerJoin(harvestEvents, eq(harvestEvents.id, batchEvents.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, and(eq(farmers.id, plots.farmerId), eq(farmers.orgId, batches.orgId)))
    .innerJoin(attestations, eq(attestations.plotId, plots.id))
    .where(eq(batchEvents.batchId, batchId))
    .orderBy(desc(attestations.anchorSeq));
  const latest = new Map<string, AttestationRecord>();
  for (const r of rows) if (!latest.has(r.plotId)) latest.set(r.plotId, r);
  return latest;
}

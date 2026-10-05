import { hashPassword } from 'better-auth/crypto';
import { createBatch } from '../../src/lib/batches/create';
import { transferBatch } from '../../src/lib/custody/transfer';
import { writeTx, type Db } from '../../src/lib/db/client';
import { account, organisations, user } from '../../src/lib/db/schema';
import { newId } from '../../src/lib/ids';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from './batch-fixtures';

// The processor hop's world (TKT-26): an FPO batch of Verified arabica pickings (by default 40 + 42.5 kg),
// handed by the FPO admin to a processor organisation that has one processor user, and a buyer to hand
// on to. Written by the real writers, so the batch's provenance closure is complete and the feed
// verifies. With `processorPassword` the processor user can sign in (e2e). Every call makes new IDs.

export type ProcessingWorld = {
  fpo: FpoWorld;
  batchId: string;
  shortHash: string;
  processorOrg: string;
  processorName: string;
  processorUserId: string;
  processorEmail: string;
  buyerOrg: string;
};

export async function seedProcessorOrg(db: Db, o: { name?: string; password?: string } = {}): Promise<{ orgId: string; name: string; userId: string; email: string }> {
  const orgId = newId('ORG-');
  const name = o.name ?? `Processor ${orgId.slice(-4)}`;
  const userId = newId('USR-');
  const email = `${userId.toLowerCase()}@processor.udgam.test`;
  const hash = o.password === undefined ? undefined : await hashPassword(o.password);
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, type: 'processor', name });
    await tx.insert(user).values({ id: userId, name: 'Ravi P.', email, emailVerified: true, role: 'processor', orgId });
    if (hash) await tx.insert(account).values({ id: `${userId}-credential`, accountId: userId, providerId: 'credential', userId, password: hash, updatedAt: new Date() });
  });
  return { orgId, name, userId, email };
}

export async function seedProcessingWorld(
  db: Db,
  o: { kgs?: number[]; crop?: 'arabica' | 'robusta'; processorName?: string; processorPassword?: string; adminPassword?: string; fpoName?: string; buyerOrg?: string } = {},
): Promise<ProcessingWorld> {
  const crop = o.crop ?? 'arabica';
  const fpo = await seedFpo(db, { orgName: o.fpoName, adminPassword: o.adminPassword });
  const eventIds: string[] = [];
  for (const kg of o.kgs ?? [40, 42.5]) eventIds.push((await seedCapture(db, fpo, { crop, kg, score: 91 })).eventId);
  const batch = await createBatch(db, { orgId: fpo.orgId, adminId: fpo.adminId, crop, eventIds });
  const p = await seedProcessorOrg(db, { name: o.processorName, password: o.processorPassword });
  await transferBatch(db, { orgId: fpo.orgId, adminId: fpo.adminId, batchId: batch.batchId, toOrgId: p.orgId });
  return {
    fpo,
    batchId: batch.batchId,
    shortHash: batch.shortHash,
    processorOrg: p.orgId,
    processorName: p.name,
    processorUserId: p.userId,
    processorEmail: p.email,
    buyerOrg: o.buyerOrg ?? (await seedBuyer(db)),
  };
}

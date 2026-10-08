import { hashPassword } from 'better-auth/crypto';
import { publicMembers } from '../src/lib/crypto';
import { writeTx, type Db } from '../src/lib/db/client';
import { account, agentPlots, farmers, organisations, plots, user } from '../src/lib/db/schema';
import { anchorEnrolledDevice } from '../src/lib/enrolment/enrol';
import { seedYieldReference } from '../src/lib/db/seed/yield-reference';
import { newId } from '../src/lib/ids';
import { append } from '../src/lib/ledger/hashchain';
import { P01_AREA_HA, P01_INSIDE, P01_POLYGON } from './tracer-plot';

export { P01_AREA_HA, P01_INSIDE, P01_POLYGON };

// The TKT-02 tracer's world: one FPO, one farmer, plot P01 (scripts/tracer-plot.ts), the FPO's field
// agent (a Better Auth user, TKT-04) with P01 assigned (TKT-05) and one phone enrolled to that agent. Used by the seed script and the integration tests. The phone
// is anchored by enrolment's own write (anchorEnrolledDevice): device_enrolled {deviceId, agentId, thumbprint}.

/** `prefix` + 8 random Crockford base32 characters. */
export const randomId = (prefix: string): string => newId(prefix);

export type TracerWorld = {
  orgId: string;
  farmerId: string;
  producerId: string;
  plotId: string;
  deviceId: string;
  agentId: string;
  /** The agent's sign-in email; with `agentPassword` the agent can sign in (the /api/capture guard). */
  agentEmail: string;
};

/**
 * Seed one FPO, one farmer, plot P01, the FPO's agent and one device enrolled to that agent with
 * `publicJwk`, anchoring the plot and the device in the ledger in the same transaction. Every run makes
 * new random IDs. With `agentPassword` the agent gets an email + password credential.
 */
export async function seedTracerWorld(
  db: Db,
  { publicJwk, now = new Date(), agentPassword }: { publicJwk: JsonWebKey; now?: Date; agentPassword?: string },
): Promise<TracerWorld> {
  const agentId = randomId('AG-');
  const world: TracerWorld = {
    orgId: randomId('ORG-'),
    farmerId: randomId('FA-'),
    producerId: randomId('PR-'),
    plotId: randomId('PL-'),
    deviceId: randomId('DV-'),
    agentId,
    agentEmail: `${agentId.toLowerCase()}@tracer.udgam.test`,
  };
  const jwk = publicMembers(publicJwk);
  const ts = now.toISOString();
  const passwordHash = agentPassword === undefined ? undefined : await hashPassword(agentPassword);
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: world.orgId, type: 'fpo', name: 'Tracer FPO (Kodagu)' });
    await tx.insert(user).values({ id: agentId, name: 'Tracer agent', email: world.agentEmail, emailVerified: true, role: 'agent', orgId: world.orgId });
    if (passwordHash !== undefined) {
      await tx.insert(account).values({ id: `${agentId}-cred`, accountId: agentId, providerId: 'credential', userId: agentId, password: passwordHash, updatedAt: now });
    }
    await tx.insert(farmers).values({ id: world.farmerId, orgId: world.orgId, name: 'Tracer farmer', producerId: world.producerId });
    // Ledger payloads are public-safe (EV16): IDs, numbers, geometry and producer_id, never names.
    const plotAnchor = await append(tx, 'plot_registered', {
      plotId: world.plotId,
      producerId: world.producerId,
      crop: 'arabica',
      areaHa: P01_AREA_HA,
      polygon: P01_POLYGON,
    });
    await tx.insert(plots).values({
      id: world.plotId,
      farmerId: world.farmerId,
      crop: 'arabica',
      geojson: JSON.stringify(P01_POLYGON),
      areaHa: P01_AREA_HA,
      anchorSeq: plotAnchor.seq,
      createdAt: ts,
      updatedAt: ts,
    });
    // The agent may capture on P01 (agent_plots, TKT-05): the capture boundary refuses unassigned plots.
    await tx.insert(agentPlots).values({ agentId: world.agentId, plotId: world.plotId, assignedAt: ts });
    // The phone, anchored exactly as enrolment anchors it: device_enrolled {deviceId, agentId, thumbprint}.
    await anchorEnrolledDevice(tx, { deviceId: world.deviceId, agentId: world.agentId, publicJwk: jwk, enrolledAt: ts });
  });
  // The TP6 yield reference the capture's yield_plausibility reads (the server seeds it at boot, TKT-09).
  await seedYieldReference(db);
  return world;
}

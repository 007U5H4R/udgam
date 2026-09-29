import { jwkThumbprint, publicMembers } from '../src/lib/crypto';
import { writeTx, type Db } from '../src/lib/db/client';
import { devices, farmers, organisations, plots } from '../src/lib/db/schema';
import { newId } from '../src/lib/ids';
import { append } from '../src/lib/ledger/hashchain';
import { P01_AREA_HA, P01_INSIDE, P01_POLYGON } from './tracer-plot';

export { P01_AREA_HA, P01_INSIDE, P01_POLYGON };

// The TKT-02 tracer's world: one FPO, one farmer, plot P01 (scripts/tracer-plot.ts) and one enrolled
// phone. Used by the seed script and the integration tests; TKT-05/06 replace it with real enrolment
// and plot registration.

/** `prefix` + 8 random Crockford base32 characters. */
export const randomId = (prefix: string): string => newId(prefix);

export type TracerWorld = {
  orgId: string;
  farmerId: string;
  producerId: string;
  plotId: string;
  deviceId: string;
  agentId: string;
};

/**
 * Seed one FPO, one farmer, plot P01 and one device enrolled with `publicJwk`, anchoring the plot
 * and the device in the ledger in the same transaction. Every run makes new random IDs.
 */
export async function seedTracerWorld(db: Db, { publicJwk, now = new Date() }: { publicJwk: JsonWebKey; now?: Date }): Promise<TracerWorld> {
  const world: TracerWorld = {
    orgId: randomId('ORG-'),
    farmerId: randomId('FA-'),
    producerId: randomId('PR-'),
    plotId: randomId('PL-'),
    deviceId: randomId('DV-'),
    agentId: randomId('AG-'),
  };
  const jwk = publicMembers(publicJwk);
  const kid = await jwkThumbprint(jwk);
  const ts = now.toISOString();
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: world.orgId, type: 'fpo', name: 'Tracer FPO (Kodagu)' });
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
    const deviceAnchor = await append(tx, 'device_enrolled', { deviceId: world.deviceId, agentId: world.agentId, kid, publicJwk: jwk, enrolledAt: ts });
    await tx.insert(devices).values({
      id: world.deviceId,
      agentId: world.agentId,
      publicKeyJwk: JSON.stringify(jwk),
      keyThumbprint: kid,
      enrolledAt: ts,
      anchorSeq: deviceAnchor.seq,
    });
  });
  return world;
}

import { jwkThumbprint, publicMembers } from '../src/lib/crypto';
import { writeTx, type Db } from '../src/lib/db/client';
import { devices, farmers, organisations, plots } from '../src/lib/db/schema';
import type { Polygon } from '../src/lib/geo/types';
import { append } from '../src/lib/ledger/hashchain';

// The TKT-02 tracer's world: one FPO, one farmer, plot P01 and one enrolled phone. TKT-03 generates
// the harness plot fixtures; until then P01 is defined here and imported by the seed script, the
// integration tests and the tracer e2e. TKT-05/06 replace this with real enrolment and registration.

/** P01: a 2.0 ha convex hexagon near Madikeri, Kodagu (RFC 7946 order, counter-clockwise, 7 dp). */
export const P01_POLYGON: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [75.739986, 12.4213057],
      [75.7393573, 12.4218229],
      [75.7385331, 12.4216088],
      [75.7384847, 12.4207742],
      [75.7390777, 12.4202501],
      [75.7397745, 12.4205949],
      [75.739986, 12.4213057],
    ],
  ],
};
export const P01_AREA_HA = 2.0;
/** Near the centroid, well inside P01. */
export const P01_INSIDE = { lat: 12.4211, lng: 75.7392 };

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** `prefix` + 8 random Crockford base32 characters. */
export function randomId(prefix: string): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return prefix + Array.from(bytes, (b) => CROCKFORD[b & 31]).join('');
}

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

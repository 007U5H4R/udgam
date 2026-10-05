import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { locate } from '../../src/lib/geo/geofence';
import { SEED, type AttackId } from './data';
import type { SeededWorld } from './run';
import { photosFor, signedCapture } from './capture';

// The four staged attacks (technical-plan TSK-20.3, F15, EVAL-074): scenario 1 GPS spoof, 2 replayed
// photos, 3 plot laundering (X01, 25 % canopy loss after 2020) and 4 yield inflation. Signed at seed time
// by agent 2's seeded phone, in this order, two hours apart, so they chain and the phone's own moves stay
// plausible. Written to DATA_DIR/demo/attacks/<id>/{payload.json, signature.txt, photo<i>.jpg} plus
// manifest.json; /admin/demo (DEMO_MODE=1, test-only) submits them through /api/capture.

export const ATTACKS_DIR = (dataDir: string) => join(dataDir, 'demo', 'attacks');

/** What /admin/demo reads (src/app/(admin)/admin/demo/attacks.ts keeps the same shape). */
export type AttackManifest = {
  v: 1;
  /** The phone that signed every attack, and its agent's sign-in email (password: seed-credentials.txt). */
  deviceId: string;
  agentEmail: string;
  attacks: {
    id: AttackId;
    title: string;
    story: string;
    plotId: string;
    cherryKg: number;
    /** sha256 of the exact payload string (payload.json): the capture it becomes, once submitted. */
    payloadHash: string;
    photos: string[];
    expected: { verdict: 'Needs Review' | 'Rejected'; check: string; evidence: string };
  }[];
};

const MIN = 60_000;
const r7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** A point due east of the plot's centre, `outsideM` (±2 m) outside its edge. */
function pointOutside(geometry: (typeof SEED.plots)[number]['geometry'], centre: readonly [number, number], outsideM: number): { lat: number; lng: number } {
  const [lng, lat] = centre;
  const mPerDegLng = 111_195 * Math.cos((lat * Math.PI) / 180);
  let lo = 0;
  let hi = 5_000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const at = locate({ lat, lng: lng + mid / mPerDegLng }, geometry);
    const outside = at.inside ? -at.distanceToEdgeM : at.distanceToEdgeM;
    if (outside < outsideM) lo = mid;
    else hi = mid;
  }
  return { lat: r7(lat), lng: r7(lng + hi / mPerDegLng) };
}

/** Sign and write the four attacks; returns the manifest written. */
export async function stageAttacks(world: SeededWorld, { dataDir, now }: { dataDir: string; now: Date }): Promise<AttackManifest> {
  const root = ATTACKS_DIR(dataDir);
  mkdirSync(root, { recursive: true });
  const agent = SEED.attackAgent;
  const signer = { ...world.devices[agent] };
  const agentEmail = SEED.users.find((u) => u.key === agent)!.email;
  const manifest: AttackManifest = { v: 1, deviceId: signer.deviceId, agentEmail, attacks: [] };
  const n = SEED.attacks.length;

  for (const [i, a] of SEED.attacks.entries()) {
    const p = SEED.plots.find((x) => x.id === a.plot)!;
    const at = new Date(now.getTime() - (2 * (n - i) - 1) * 60 * MIN).toISOString(); // 7 h, 5 h, 3 h and 1 h ago
    const [lng, lat] = p.centre;
    const gps = 'outsideM' in a && a.outsideM ? pointOutside(p.geometry, p.centre, a.outsideM) : { lat, lng };
    const photos =
      'photosOf' in a && a.photosOf !== undefined
        ? world.photos[a.photosOf]! // the exact bytes of an earlier honest picking
        : await photosFor({ count: a.photos, at, gps, variant: 100 + i, label: `attack-${a.id}` });
    const c = await signedCapture(signer, { plotId: world.plotIds[p.id]!, capturedAt: at, gps: { ...gps, accuracyM: 7 }, cherryKg: a.kg, photos });
    signer.nextSeq += 1;
    signer.lastEventHash = c.payloadHash;

    const dir = join(root, a.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'payload.json'), c.payloadString); // the exact signed bytes (RFC 8785)
    writeFileSync(join(dir, 'signature.txt'), `${c.signature}\n`);
    const names = photos.map((bytes, k) => {
      const name = `photo${k}.jpg`;
      writeFileSync(join(dir, name), bytes);
      return name;
    });
    manifest.attacks.push({
      id: a.id,
      title: a.title,
      story: a.story,
      plotId: world.plotIds[p.id]!,
      cherryKg: a.kg,
      payloadHash: c.payloadHash,
      photos: names,
      expected: { ...a.expected },
    });
  }
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

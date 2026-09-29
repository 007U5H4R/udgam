// Seeds the TKT-02 tracer world into DATA_DIR's database: one FPO, one farmer (random producer_id),
// plot P01 and one device whose TEST key pair is written to a git-ignored JSON file for the e2e to
// inject into the browser. Prints IDs only, never key material.
//
// Usage: DATA_DIR=.e2e-data pnpm exec tsx scripts/seed-tracer.ts [--out <key file>]
//        (default key file: $DATA_DIR/tracer-key.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateKeyPair } from '../src/lib/crypto';
import { env } from '../src/lib/config/env';
import { closeDb, getDbReady } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { seedTracerWorld } from './tracer-world';

export type TracerKeyFile = {
  deviceId: string;
  plotId: string;
  producerId: string;
  publicJwk: JsonWebKey;
  /** TEST-ONLY private key for the e2e to import into IndexedDB. Never used outside .e2e-data. */
  testOnlyPrivateJwk: JsonWebKey;
};

async function main(): Promise<void> {
  const outFlag = process.argv.indexOf('--out');
  const out = outFlag > 0 && process.argv[outFlag + 1] ? process.argv[outFlag + 1]! : join(env.DATA_DIR, 'tracer-key.json');

  const db = await getDbReady();
  try {
    await runMigrations(db);
    const pair = await generateKeyPair(true);
    const publicJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey);
    const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
    const world = await seedTracerWorld(db, { publicJwk });
    const file: TracerKeyFile = {
      deviceId: world.deviceId,
      plotId: world.plotId,
      producerId: world.producerId,
      publicJwk,
      testOnlyPrivateJwk: privateJwk,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file), { mode: 0o600 });
    console.log(JSON.stringify({ seeded: 'tracer', deviceId: world.deviceId, plotId: world.plotId, producerId: world.producerId }));
  } finally {
    closeDb();
  }
}

await main();

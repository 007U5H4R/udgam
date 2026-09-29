// Seeds the TKT-02 tracer world into DATA_DIR's database: one FPO, one farmer (random producer_id),
// plot P01, the FPO's agent and one device enrolled to that agent. The device's TEST key pair and the
// agent's random per-run TEST password are written to an ignored JSON file for the e2e (it signs in
// as the agent, TKT-04, and injects the key into the browser). Prints IDs only, never key material or
// the password.
//
// Usage: DATA_DIR=.e2e-data pnpm exec tsx scripts/seed-tracer.ts [--out <key file>]
//        (default key file: $DATA_DIR/tracer-key.json)
import { randomBytes } from 'node:crypto';
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
  /** The device's agent, who must be signed in to capture (technical-plan §10). */
  agentEmail: string;
  /** TEST-ONLY random password for that agent, made per run. Never used outside .e2e-data. */
  testOnlyAgentPassword: string;
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
    const agentPassword = randomBytes(18).toString('base64url');
    const world = await seedTracerWorld(db, { publicJwk, agentPassword });
    const file: TracerKeyFile = {
      deviceId: world.deviceId,
      plotId: world.plotId,
      producerId: world.producerId,
      publicJwk,
      testOnlyPrivateJwk: privateJwk,
      agentEmail: world.agentEmail,
      testOnlyAgentPassword: agentPassword,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file), { mode: 0o600 });
    console.log(JSON.stringify({ seeded: 'tracer', deviceId: world.deviceId, plotId: world.plotId, producerId: world.producerId }));
  } finally {
    closeDb();
  }
}

await main();

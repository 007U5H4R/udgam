// Test and demo helper for phone enrolment (TKT-05): makes sure the demo accounts exist, then has the
// agent's FPO admin issue a one-time enrolment code for the agent. Optionally (`--enrol`) enrols a phone
// for that agent with a fresh key made here, and (`--plot`) registers a new, unassigned plot in the
// agent's organisation. Writes the result to an ignored JSON file for the e2e; prints IDs only, never
// the code or the password.
//
// Usage: DATA_DIR=.e2e-data pnpm exec tsx scripts/seed-enrolment.ts --out <file> [--agent agentA|agentB] [--enrol] [--plot]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeyPair } from '../src/lib/crypto';
import { closeDb, getDbReady, writeTx, type Db } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { farmers, plots } from '../src/lib/db/schema';
import { issueCode } from '../src/lib/enrolment/codes';
import { enrolDevice } from '../src/lib/enrolment/enrol';
import { newId } from '../src/lib/ids';
import { append } from '../src/lib/ledger/hashchain';
import { DEMO_ACCOUNTS, seedAccounts, seedPassword } from './seed-accounts';
import { P01_AREA_HA, P01_POLYGON } from './tracer-plot';

export type EnrolmentSeed = {
  agentId: string;
  agentEmail: string;
  adminEmail: string;
  /** TEST-ONLY one-time code, valid 24 h. Never used outside .e2e-data. */
  testOnlyCode: string;
  expiresAt: string;
  deviceId?: string;
  plotId?: string;
};

/** Register a new plot (with its farmer) in `orgId`, anchored like every plot (§4.2). */
async function registerPlot(db: Db, orgId: string): Promise<string> {
  const plotId = newId('PL-');
  const farmerId = newId('FA-');
  const producerId = newId('PR-');
  const ts = new Date().toISOString();
  await writeTx(db, async (tx) => {
    await tx.insert(farmers).values({ id: farmerId, orgId, name: `Test farmer ${farmerId.slice(3)}`, producerId });
    const a = await append(tx, 'plot_registered', { plotId, producerId, crop: 'arabica', areaHa: P01_AREA_HA, polygon: P01_POLYGON });
    await tx.insert(plots).values({ id: plotId, farmerId, crop: 'arabica', geojson: JSON.stringify(P01_POLYGON), areaHa: P01_AREA_HA, anchorSeq: a.seq, createdAt: ts, updatedAt: ts });
  });
  return plotId;
}

async function main(): Promise<void> {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const out = arg('--out');
  if (!out) throw new Error('--out <file> is required');
  const agentKey = (arg('--agent') ?? 'agentA') as 'agentA' | 'agentB';
  const agent = DEMO_ACCOUNTS[agentKey];
  const admin = agentKey === 'agentA' ? DEMO_ACCOUNTS.adminA : DEMO_ACCOUNTS.adminB;

  const db = await getDbReady();
  try {
    await runMigrations(db);
    await seedAccounts(db, seedPassword());
    const seed: EnrolmentSeed = { agentId: agent.id, agentEmail: agent.email, adminEmail: admin.email, testOnlyCode: '', expiresAt: '' };
    if (process.argv.includes('--enrol')) {
      const enrolCode = await issueCode(db, { agentId: agent.id, adminId: admin.id, orgId: agent.orgId });
      const pair = await generateKeyPair(false);
      const publicJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey);
      const r = await enrolDevice(db, { code: enrolCode.code, publicJwk, ip: `seed-${newId('')}`, sessionAgentId: agent.id });
      if (!r.ok) throw new Error(`enrolment refused: ${r.reason}`);
      seed.deviceId = r.deviceId;
    }
    if (process.argv.includes('--plot')) seed.plotId = await registerPlot(db, agent.orgId);
    const { code, expiresAt } = await issueCode(db, { agentId: agent.id, adminId: admin.id, orgId: agent.orgId });
    seed.testOnlyCode = code;
    seed.expiresAt = expiresAt;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(seed), { mode: 0o600 });
    console.log(JSON.stringify({ seeded: 'enrolment', agentId: seed.agentId, deviceId: seed.deviceId, plotId: seed.plotId }));
  } finally {
    closeDb();
  }
}

await main();

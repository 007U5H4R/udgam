// Test and demo helper for phone enrolment (TKT-05): creates a fresh FPO with its own admin and field
// agent (password SEED_PASSWORD, or the dev/test demo default), then has the admin issue a one-time
// enrolment code for the agent. Optionally (`--enrol`) enrols a phone for that agent with a fresh key
// made here, and (`--plot`) registers a new, unassigned plot in the organisation. A fresh organisation
// per call keeps parallel e2e runs apart: issuing a code retires the agent's older unused codes. Writes
// the result to an ignored JSON file for the e2e; prints IDs only, never the code or the password.
//
// Usage: DATA_DIR=.e2e-data pnpm exec tsx scripts/seed-enrolment.ts --out <file> [--enrol] [--plot]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { generateKeyPair, publicMembers } from '../src/lib/crypto';
import { closeDb, getDbReady, writeTx, type Db } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { account, farmers, organisations, plots, user } from '../src/lib/db/schema';
import { issueCode } from '../src/lib/enrolment/codes';
import { enrolDevice } from '../src/lib/enrolment/enrol';
import { newId } from '../src/lib/ids';
import { append } from '../src/lib/ledger/hashchain';
import { seedPassword } from './seed-accounts';
import { P01_AREA_HA, P01_POLYGON } from './tracer-plot';

export type EnrolmentSeed = {
  orgId: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  adminEmail: string;
  /** TEST-ONLY one-time code, valid 24 h. Never used outside .e2e-data. */
  testOnlyCode: string;
  expiresAt: string;
  deviceId?: string;
  plotId?: string;
};

/** A fresh FPO with one admin and one agent, both with an email + password credential. */
async function freshOrg(db: Db, password: string) {
  const orgId = newId('ORG-');
  const tag = orgId.slice(4).toLowerCase();
  const people = {
    admin: { id: newId('USR-'), name: `Test admin ${tag}`, email: `admin-${tag}@enrol.udgam.test`, role: 'admin' as const },
    agent: { id: newId('USR-'), name: `Test agent ${tag}`, email: `agent-${tag}@enrol.udgam.test`, role: 'agent' as const },
  };
  const hash = await hashPassword(password);
  const now = new Date();
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: `Test FPO ${tag}` });
    for (const p of Object.values(people)) {
      await tx.insert(user).values({ ...p, emailVerified: true, orgId, createdAt: now, updatedAt: now });
      await tx.insert(account).values({ id: `${p.id}-credential`, accountId: p.id, providerId: 'credential', userId: p.id, password: hash, createdAt: now, updatedAt: now });
    }
  });
  return { orgId, ...people };
}

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
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : undefined;
  if (!out) throw new Error('--out <file> is required');

  const db = await getDbReady();
  try {
    await runMigrations(db);
    const org = await freshOrg(db, seedPassword());
    const scope = { agentId: org.agent.id, adminId: org.admin.id, orgId: org.orgId };
    const seed: EnrolmentSeed = {
      orgId: org.orgId,
      agentId: org.agent.id,
      agentName: org.agent.name,
      agentEmail: org.agent.email,
      adminEmail: org.admin.email,
      testOnlyCode: '',
      expiresAt: '',
    };
    if (process.argv.includes('--enrol')) {
      const enrolCode = await issueCode(db, scope);
      const pair = await generateKeyPair(false);
      const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
      const r = await enrolDevice(db, { code: enrolCode.code, publicJwk, ip: `seed-${newId('')}`, sessionAgentId: org.agent.id });
      if (!r.ok) throw new Error(`enrolment refused: ${r.reason}`);
      seed.deviceId = r.deviceId;
    }
    if (process.argv.includes('--plot')) seed.plotId = await registerPlot(db, org.orgId);
    const { code, expiresAt } = await issueCode(db, scope);
    seed.testOnlyCode = code;
    seed.expiresAt = expiresAt;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(seed), { mode: 0o600 });
    console.log(JSON.stringify({ seeded: 'enrolment', orgId: seed.orgId, agentId: seed.agentId, deviceId: seed.deviceId, plotId: seed.plotId }));
  } finally {
    closeDb();
  }
}

await main();

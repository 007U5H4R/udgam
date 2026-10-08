import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { count, eq, isNull, ne, or } from 'drizzle-orm';
import { mulberry32 } from '../../evals/harness/fixtures';
import { attachAttestation } from '../../src/lib/attestations/attach';
import { createBatch } from '../../src/lib/batches/create';
import { runCapture, type CaptureEvent } from '../../src/lib/capture/pipeline';
import { env } from '../../src/lib/config/env';
import { generateKeyPair, publicMembers } from '../../src/lib/crypto';
import { transferBatch } from '../../src/lib/custody/transfer';
import { closeDb, getDbReady, writeTx, type Db } from '../../src/lib/db/client';
import { prepareDatabase } from '../../src/lib/db/migrate';
import { account, ledgerEntries, media, organisations, user, verificationRuns } from '../../src/lib/db/schema';
import { assignPlot } from '../../src/lib/enrolment/assign';
import { issueCode } from '../../src/lib/enrolment/codes';
import { enrolDevice } from '../../src/lib/enrolment/enrol';
import { locate } from '../../src/lib/geo/geofence';
import { checkpointIfNeeded } from '../../src/lib/ledger/checkpoint';
import { localMediaStore } from '../../src/lib/media/store';
import { registerPlot } from '../../src/lib/plots/plots';
import { overrideRun } from '../../src/lib/review/override';
import { SEED, type AgentKey, type SeedPlot, type UserKey } from './data';
import { stageAttacks } from './attacks';
import { captureForm, photosFor, signedCapture } from './capture';
import { historyTimes } from './timeline';

// `pnpm seed` (technical-plan TSK-20.2, TC-077): the Kodagu demo state, built through the app's own
// functions so every row is anchored exactly as in production: registerPlot (and its registration
// checks), assignPlot, issueCode + enrolDevice, runCapture with signed payloads and photos (the whole
// capture pipeline and verifier), overrideRun, attachAttestation, createBatch and transferBatch. Only
// organisations and accounts are inserted directly, as scripts/seed-accounts.ts does: they are not
// provenance.
//
// Refuses a database that already holds data ("not empty — use --reset"). --reset recreates it: the
// provenance tables refuse DELETE and REPLACE (migrations 0010/0015/0016/0018), so the database file,
// the media and the seed files under DATA_DIR are removed and everything is migrated and built again.
// The ledger key and the admins' signing keys under DATA_DIR/keys are kept.
//
// Demo data only: fixture satellite answers, fictional farmers and AI-generated photos (TP29). It runs only
// with NODE_ENV explicitly development or test, or on the Playwright server (E2E=1; EXE12), and refuses
// before touching DATA_DIR otherwise (seedAllowed). Passwords are generated per run into
// DATA_DIR/seed-credentials.txt (0600) and never printed; the seeded phones' keys go to
// DATA_DIR/seed-keys/ (0600), used only by the seeder. It prints counts and the credentials file's path.

export const SEED_NOT_EMPTY = 'DATA_DIR is not empty — use --reset';
export const SEED_REFUSED =
  'the demo seed runs only with NODE_ENV=development or NODE_ENV=test, or on the Playwright server (E2E=1): it builds fixture data (EXE12). Nothing was changed.';

export const SEED_RESET_ELSEWHERE =
  '--reset recreates only DATA_DIR/udgam.db, but DATABASE_URL points elsewhere: unset DATABASE_URL or point it there. Nothing was changed.';

/**
 * Does the database the app opens (DATABASE_URL) live at DATA_DIR/udgam.db? --reset removes that file
 * and DATA_DIR's media; with a database elsewhere it would delete the media of a database it keeps.
 */
export function resetTargetsDataDir(): boolean {
  const url = env.DATABASE_URL;
  if (!url.startsWith('file:')) return false;
  return resolve(url.slice('file:'.length)) === resolve(env.DATA_DIR, 'udgam.db');
}

/**
 * May the demo seed run here? Only when NODE_ENV is EXPLICITLY `development` or `test`, or on the
 * Playwright server (E2E=1). env.ts defaults an unset NODE_ENV to `development`, so the raw variable is
 * checked too, as scripts/seed-accounts.ts does: an operator shell on the production host has no
 * NODE_ENV, and `pnpm seed --reset` there would delete the database, the ledger and the media.
 */
export function seedAllowed(): boolean {
  if (env.E2E === '1') return true;
  const explicit = process.env.NODE_ENV; // not a secret; only whether it was set, and to what
  return (explicit === 'development' || explicit === 'test') && env.NODE_ENV === explicit;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** What the seed made (printed by `pnpm seed`). */
export type SeedCounts = {
  organisations: number;
  users: number;
  plots: number;
  assignments: number;
  devices: number;
  pickings: { Verified: number; 'Needs Review': number };
  overrides: number;
  attestations: number;
  batches: number;
  transfers: number;
  attacks: number;
  credentials: string;
};

/** The seeded world, by data-set key (for the staged attacks and the tests). */
export type SeededWorld = {
  orgId: string;
  buyerOrgId: string;
  userIds: Record<UserKey, string>;
  plotIds: Record<string, string>;
  devices: Record<AgentKey, { deviceId: string; agentId: string; privateKey: CryptoKey; nextSeq: number; lastEventHash: string }>;
  /** Each honest picking's photo bytes, in history order (the replay attack resends some). */
  photos: Uint8Array<ArrayBuffer>[][];
  eventIds: string[];
};

/** Remove the database, its WAL files, the media and the seed's own files from `dataDir`. */
export function resetDataDir(dataDir: string): void {
  const root = resolve(dataDir);
  for (const name of ['udgam.db', 'udgam.db-wal', 'udgam.db-shm', 'udgam.db-journal', 'media', 'attestations', 'staging', 'demo', 'seed-keys', 'seed-credentials.txt']) {
    rmSync(join(root, name), { recursive: true, force: true });
  }
}

async function isEmpty(db: Db): Promise<boolean> {
  const [org] = await db.select({ id: organisations.id }).from(organisations).limit(1);
  const [entry] = await db.select({ seq: ledgerEntries.seq }).from(ledgerEntries).limit(1);
  return !org && !entry;
}

/** A file only its owner can read, written whole. */
function writePrivate(path: string, text: string): void {
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600); // an existing file keeps its old mode on write
}

const r7 = (n: number): number => Math.round(n * 1e7) / 1e7;

/** A point near the plot's centre, jittered up to ±6 m, still inside with a margin; else the centre. */
function capturePoint(p: SeedPlot, i: number): { lat: number; lng: number } {
  const rand = mulberry32(0x5eed + i);
  const [lng, lat] = p.centre;
  const dLat = ((rand() - 0.5) * 12) / 111_195;
  const dLng = ((rand() - 0.5) * 12) / (111_195 * Math.cos((lat * Math.PI) / 180));
  const q = { lat: r7(lat + dLat), lng: r7(lng + dLng) };
  const at = locate(q, p.geometry);
  return at.inside && at.distanceToEdgeM > 5 ? q : { lat, lng };
}

const PDF = new TextEncoder().encode('%PDF-1.4\n% Udgam demo organic certificate (fictional, demo data)\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

const silent = { error: () => undefined, info: () => undefined, warn: () => undefined };

/** Build the demo world into `db` (migrated, empty) and `dataDir`. */
export async function runSeed(db: Db, { dataDir, now = new Date() }: { dataDir: string; now?: Date }): Promise<{ counts: Omit<SeedCounts, 'credentials'>; world: SeededWorld }> {
  if (!(await isEmpty(db))) throw new Error(SEED_NOT_EMPTY);
  // The pickings' times first: in the season's first 10 minutes this refuses before anything is written.
  const times = historyTimes(now);
  mkdirSync(dataDir, { recursive: true });
  const store = localMediaStore(dataDir);
  const orgId = SEED.fpo.id;
  const buyerOrgId = SEED.buyer.id;
  const userIds = Object.fromEntries(SEED.users.map((u) => [u.key, u.id])) as Record<UserKey, string>;
  const adminId = userIds.admin;
  const registeredAt = new Date(now.getTime() - 30 * 24 * HOUR);

  // Organisations and accounts (not provenance), each with its own generated password.
  const passwords = SEED.users.map(() => randomBytes(18).toString('base64url'));
  const hashes = await Promise.all(passwords.map((p) => hashPassword(p)));
  await writeTx(db, async (tx) => {
    await tx.insert(organisations).values({ id: orgId, type: 'fpo', name: SEED.fpo.name, officePhone: '+918000000000' });
    await tx.insert(organisations).values({ id: buyerOrgId, type: 'buyer', name: SEED.buyer.name });
    for (const [i, u] of SEED.users.entries()) {
      const org = u.org === 'fpo' ? orgId : buyerOrgId;
      await tx.insert(user).values({ id: u.id, name: u.name, email: u.email, emailVerified: true, role: u.role, orgId: org, createdAt: registeredAt, updatedAt: registeredAt });
      await tx.insert(account).values({ id: `${u.id}-credential`, accountId: u.id, providerId: 'credential', userId: u.id, password: hashes[i]!, createdAt: registeredAt, updatedAt: registeredAt });
    }
  });
  writePrivate(
    join(dataDir, 'seed-credentials.txt'),
    [
      '# Udgam demo accounts, generated by `pnpm seed` (demo data only; keep this file private).',
      '# role\temail\tpassword',
      ...SEED.users.map((u, i) => `${u.role}\t${u.email}\t${passwords[i]}`),
      '',
    ].join('\n'),
  );

  // Plots (registration checks run on each), then who records where.
  const plotIds: Record<string, string> = {};
  for (const p of SEED.plots) {
    const { plotId } = await registerPlot(db, orgId, { crop: p.crop, geometry: p.geometry, newFarmer: p.farmer }, () => registeredAt);
    plotIds[p.id] = plotId;
  }
  let assignments = 0;
  for (const p of SEED.plots) {
    for (const a of p.agents) {
      await assignPlot(db, { agentId: userIds[a], plotId: plotIds[p.id]!, orgId }, registeredAt);
      assignments++;
    }
  }

  // One phone per agent, enrolled with a code from the office like any phone. The keys stay with the seeder.
  mkdirSync(join(dataDir, 'seed-keys'), { recursive: true, mode: 0o700 });
  const devices = {} as SeededWorld['devices'];
  for (const [i, agent] of (['agent1', 'agent2'] as const).entries()) {
    const pair = await generateKeyPair(true);
    const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
    const { code } = await issueCode(db, { agentId: userIds[agent], adminId, orgId }, registeredAt);
    const r = await enrolDevice(db, { code, publicJwk, ip: `198.18.0.${i + 1}`, sessionAgentId: userIds[agent] }, registeredAt);
    if (!r.ok) throw new Error(`seed: enrolment refused (${r.reason})`);
    devices[agent] = { deviceId: r.deviceId, agentId: userIds[agent], privateKey: pair.privateKey, nextSeq: 1, lastEventHash: 'genesis' };
    const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
    writePrivate(join(dataDir, 'seed-keys', `${agent}.json`), `${JSON.stringify({ deviceId: r.deviceId, agentId: userIds[agent], publicJwk, seedOnlyPrivateJwk: privateJwk })}\n`);
  }

  // The honest history: each picking signed by agent 1's phone and run through the capture pipeline.
  const plotOf = (id: string) => SEED.plots.find((p) => p.id === id)!;
  const photos: Uint8Array<ArrayBuffer>[][] = [];
  const eventIds: string[] = [];
  const verdicts = { Verified: 0, 'Needs Review': 0 };
  let overrides = 0;
  for (const [i, h] of SEED.history.entries()) {
    const p = plotOf(h.plot);
    const signer = devices[h.agent];
    const at = times[i]!;
    const gps = capturePoint(p, i);
    const shots = await photosFor({ count: h.photos, at, gps, variant: i, label: `seed-${i + 1}` });
    const c = await signedCapture(signer, { plotId: plotIds[p.id]!, capturedAt: at, gps: { ...gps, accuracyM: 5 + (i % 10) }, cherryKg: h.kg, photos: shots });
    const received = new Date(Date.parse(at) + 40_000 + (i % 5) * 7_000);
    const lines: CaptureEvent[] = [];
    await runCapture(captureForm(c, shots), { db, media: store, agentId: signer.agentId, now: () => received, log: silent }, (l) => lines.push(l));
    const v = lines.at(-1);
    if (v?.t !== 'verdict') throw new Error(`seed: picking ${i + 1} on ${p.id} was not accepted (${v?.t === 'rejected' ? v.reason : 'error'})`);
    if (v.verdict !== h.expect) {
      const why = v.checks.filter((k) => k.status !== 'ok').map((k) => `${k.id}: ${k.evidence}`);
      throw new Error(`seed: picking ${i + 1} on ${p.id} is ${v.verdict}, expected ${h.expect} (${why.join('; ')})`);
    }
    verdicts[v.verdict]++;
    signer.nextSeq += 1;
    signer.lastEventHash = c.payloadHash;
    photos.push(shots);
    eventIds.push(v.eventId);
    // The photos are AI-generated demo images (TP29): say so on their rows. Not in runCapture's own
    // transaction: that is the production capture path, and persist.ts deliberately takes no source from
    // its caller, so no request path can set the label. A crash between the two leaves a half-built seed
    // that must be rebuilt with --reset anyway, and the check at the end refuses an unlabelled row. The
    // label is storage-only: no screen reads it, and it is in no ledger payload.
    await writeTx(db, (tx) => tx.update(media).set({ source: 'generated-demo' }).where(eq(media.eventId, v.eventId)));
    if ('override' in h && h.override) {
      const [run] = await db.select({ id: verificationRuns.id }).from(verificationRuns).where(eq(verificationRuns.eventId, v.eventId));
      // 20 minutes after the picking arrived, or halfway to the seed's clock early in a season (timeline.ts).
      const overriddenAt = new Date(Math.min(received.getTime() + 20 * MIN, Math.floor((received.getTime() + now.getTime()) / 2)));
      await overrideRun(db, { orgId, adminId, runId: run!.id, newVerdict: h.override.verdict, reason: h.override.reason }, () => overriddenAt);
      overrides++;
    }
  }

  // An organic certificate on P01, then a batch of P01's and P02's pickings handed to the buyer.
  const year = now.getUTCFullYear();
  // On the seed's clock too, just before `now`, after every picking and the override (timeline.ts).
  const before = (s: number) => () => new Date(now.getTime() - s * 1_000);
  await attachAttestation(db, { orgId, plotId: plotIds.P01!, file: PDF, issuer: 'INDOCERT', validFrom: `${year}-01-01`, validTo: `${year + 1}-12-31` }, { store, now: before(30) });
  const batched = SEED.history.flatMap((h, i) => (h.plot === 'P01' || h.plot === 'P02' ? [eventIds[i]!] : []));
  const batch = await createBatch(db, { orgId, adminId, crop: 'arabica', eventIds: batched }, before(20));
  await transferBatch(db, { orgId, adminId, batchId: batch.batchId, toOrgId: buyerOrgId }, before(10));

  // Seal everything so far in a signed checkpoint (S7).
  await writeTx(db, (tx) => checkpointIfNeeded(tx, { now: () => now }));

  // Every media row the seed made carries the demo label (see the note at the UPDATE above).
  const [unlabelled] = await db.select({ n: count() }).from(media).where(or(isNull(media.source), ne(media.source, 'generated-demo')));
  if (unlabelled!.n > 0) throw new Error(`seed: ${unlabelled!.n} media rows are not labelled generated-demo`);

  const world: SeededWorld = { orgId, buyerOrgId, userIds, plotIds, devices, photos, eventIds };
  // The four staged attacks, signed by agent 2's phone, ready for /admin/demo (TSK-20.3).
  const manifest = await stageAttacks(world, { dataDir, now });

  return {
    counts: {
      organisations: 2,
      users: SEED.users.length,
      plots: SEED.plots.length,
      assignments,
      devices: Object.keys(devices).length,
      pickings: verdicts,
      overrides,
      attestations: 1,
      batches: 1,
      transfers: 1,
      attacks: manifest.attacks.length,
    },
    world,
  };
}

/**
 * The seed on the app's own database (DATA_DIR): --reset closes it, removes it and the seed's files,
 * then migrates a new one. Resolves with the counts.
 */
export async function seed({ reset = false, now = new Date() }: { reset?: boolean; now?: Date } = {}): Promise<SeedCounts> {
  // Before anything under DATA_DIR is touched (--reset deletes the database, the ledger and the media).
  if (!seedAllowed()) throw new Error(SEED_REFUSED);
  historyTimes(now); // refuses in the season's first 10 minutes (SEASON_JUST_STARTED), before the reset
  const dataDir = env.DATA_DIR;
  if (reset) {
    if (!resetTargetsDataDir()) throw new Error(SEED_RESET_ELSEWHERE);
    closeDb();
    resetDataDir(dataDir);
  }
  const db = await getDbReady();
  await prepareDatabase(db);
  const { counts } = await runSeed(db, { dataDir, now });
  return { ...counts, credentials: join(dataDir, 'seed-credentials.txt') };
}

/** `pnpm seed [--reset]`: prints the counts and the credentials file's path, never a password. */
export async function main(argv: string[]): Promise<number> {
  try {
    const counts = await seed({ reset: argv.includes('--reset') });
    console.log(JSON.stringify({ seeded: 'kodagu-demo', ...counts }));
    return 0;
  } catch (err) {
    console.error(`seed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    closeDb();
  }
}

export const credentialsPath = (dataDir: string): string => join(dataDir, 'seed-credentials.txt');

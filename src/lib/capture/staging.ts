import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { and, count, eq, gt, inArray, lte, ne } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { devices, stagedMedia } from '../db/schema';
import { mimeMatches, SNIFF_BYTES, sniffImage } from '../media/sniff';
import { MAX_PHOTO_BYTES } from './limits';

// Photo staging (technical-plan §22 TSK-30.1, TP28; TC-093). A phone uploads each photo when the farmer
// taps "Use this photo", so Submit only has to send the signed payload. Staging moves bytes earlier and
// nothing else: the payload still signs every photo's sha256 (S1), and the capture re-hashes a staged
// file against it before use (parse.ts, then the boundary). A staged file is not provenance: nothing is
// anchored, it never counts as "seen" (photo_uniqueness reads accepted `media` rows only), it belongs to
// one agent and the phone that staged it, and it expires after STAGE_TTL_MS (swept on every stage call,
// after every capture and at startup, temp and row-less files included: sweepStaging).
// Files live at DATA_DIR/staging/<agentId>/<sha256>, written to a temp file and renamed into place.
//
// The phone binding is advisory within one agent (TKT-30 review #4): `X-Udgam-Device` is not
// authenticated, so any session of the agent may stage under any of the agent's enrolled, unrevoked
// phones. It never crosses agents, and the payload's signature and hashes still decide what is captured.
// The same bytes staged again from another phone keep the first phone while its row is unexpired.

/** How long a staged photo is kept for its capture. */
export const STAGE_TTL_MS = 60 * 60 * 1000;
/** Unexpired staged photos one agent may hold (four pickings' worth). */
export const MAX_STAGED_PER_AGENT = 12;
/** Stage uploads per signed-in agent (TSK-30.2): 60 per 10 minutes, counted before the body is read. */
export const STAGE_AGENT_LIMIT = { limit: 60, windowSec: 10 * 60 } as const;
/** Stage uploads per client address: three photos for each of the capture route's 60 (rate-limit.ts IP_LIMIT). */
export const STAGE_IP_LIMIT = { limit: 180, windowSec: 10 * 60 } as const;
export const stageAgentKey = (agentId: string) => `stage:agent:${agentId}`;
export const stageIpKey = (ip: string) => `stage:ip:${ip}`;

/** Stage uploads read and stored at once, per process (each holds up to MAX_PHOTO_BYTES in memory). */
export const MAX_STAGES_IN_FLIGHT = 4;
/** Of those, the most one agent may hold: the phone sends at most two at a time (stage-client.ts). */
export const MAX_STAGES_PER_AGENT = 2;

type SlotState = { inFlight: number; perAgent: Map<string, number> };
const SLOT_KEY = Symbol.for('udgam.capture.stage-slots.v1');
// On globalThis, like in-flight.ts, so one process has one count however often the module is loaded.
const slots: SlotState =
  ((globalThis as Record<symbol, unknown>)[SLOT_KEY] as SlotState | undefined) ??
  ((globalThis as Record<symbol, unknown>)[SLOT_KEY] = { inFlight: 0, perAgent: new Map() } satisfies SlotState);

/**
 * A stage slot for `agentId`, kept apart from the capture slots (in-flight.ts) so photos still uploading
 * never make the agent's Submit wait. The release function is idempotent.
 */
export function acquireStageSlot(agentId: string): { ok: true; release: () => void } | { ok: false } {
  const mine = slots.perAgent.get(agentId) ?? 0;
  if (mine >= MAX_STAGES_PER_AGENT || slots.inFlight >= MAX_STAGES_IN_FLIGHT) return { ok: false };
  slots.inFlight++;
  slots.perAgent.set(agentId, mine + 1);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      slots.inFlight--;
      const left = (slots.perAgent.get(agentId) ?? 1) - 1;
      if (left > 0) slots.perAgent.set(agentId, left);
      else slots.perAgent.delete(agentId);
    },
  };
}

/** May this phone stage for this agent? It must be enrolled to the agent and not revoked. */
export async function stagingDevice(db: Db, agentId: string, deviceId: string): Promise<'ok' | 'device_not_owned' | 'device_revoked'> {
  const [d] = await db.select({ agentId: devices.agentId, revokedAt: devices.revokedAt }).from(devices).where(eq(devices.id, deviceId));
  if (!d || d.agentId !== agentId) return 'device_not_owned';
  return d.revokedAt === null ? 'ok' : 'device_revoked';
}

export type StageError = 'too_large' | 'bad_type' | 'too_many';
export type StageResult = { sha256: string; expiresAt: string } | { error: StageError };

/** The staged files on disk, under one DATA_DIR. Paths are relative to it. */
export interface StagingStore {
  /** Where the agent's copy of `sha256` lives (relative to DATA_DIR). */
  pathOf(agentId: string, sha256: string): string;
  /** Write `bytes` to a temp file beside `path`; returns the temp path to `commit` or `discard`. */
  prepare(path: string, bytes: Uint8Array): Promise<string>;
  /** Move a prepared temp file into place (atomic on one filesystem). */
  commit(tmp: string, path: string): Promise<void>;
  discard(tmp: string): Promise<void>;
  /** Up to `max` bytes of the file, or null when it is not there. */
  read(path: string, max: number): Promise<Uint8Array | null>;
  /** Remove the file (no-op when it is already gone). */
  remove(path: string): Promise<void>;
  /** Every file under the staging folder (temp files included), with when it was last written. */
  list(): Promise<{ path: string; mtimeMs: number }[]>;
}

const SHA = /^[0-9a-f]{64}$/;
/** User ids are random alphanumerics (Better Auth) or seeded `AG-…` ids: always one safe path segment. */
const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

async function unlinkIfPresent(abs: string): Promise<void> {
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function localStagingStore(dataDir: string): StagingStore {
  const root = resolve(dataDir);
  const inside = (rel: string) => {
    const abs = resolve(root, rel);
    const r = relative(root, abs);
    const [top, ...rest] = r.split(sep);
    if (r === '' || isAbsolute(r) || top !== 'staging' || rest.length === 0) throw new Error('staged path is outside the staging area');
    return abs;
  };
  return {
    pathOf(agentId, sha256) {
      if (!SEGMENT.test(agentId)) throw new Error('agent id is not a safe path segment');
      if (!SHA.test(sha256)) throw new Error('not a sha256');
      return join('staging', agentId, sha256);
    },
    async prepare(path, bytes) {
      const abs = inside(path);
      await mkdir(dirname(abs), { recursive: true });
      const tmp = `${path}.${randomUUID()}.tmp`;
      await writeFile(inside(tmp), bytes, { mode: 0o640 });
      return tmp;
    },
    async commit(tmp, path) {
      await rename(inside(tmp), inside(path));
    },
    async discard(tmp) {
      await unlinkIfPresent(inside(tmp));
    },
    async read(path, max) {
      let fh;
      try {
        fh = await open(inside(path), 'r');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
      try {
        // Sized from the file itself (at most `max`): a capture holds only its photos' own bytes.
        const want = Math.min(max, (await fh.stat()).size);
        const buf = new Uint8Array(want);
        let n = 0;
        while (n < want) {
          const { bytesRead } = await fh.read(buf, n, want - n, n);
          if (bytesRead === 0) break;
          n += bytesRead;
        }
        return n === want ? buf : buf.slice(0, n);
      } finally {
        await fh.close();
      }
    },
    async remove(path) {
      await unlinkIfPresent(inside(path));
    },
    async list() {
      const out: { path: string; mtimeMs: number }[] = [];
      let agents: string[];
      try {
        agents = await readdir(join(root, 'staging'));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out;
        throw err;
      }
      for (const agent of agents) {
        let names: string[];
        try {
          names = await readdir(join(root, 'staging', agent));
        } catch {
          continue; // not a folder, or gone meanwhile
        }
        for (const name of names) {
          const path = join('staging', agent, name);
          try {
            const s = await stat(inside(path));
            if (s.isFile()) out.push({ path, mtimeMs: s.mtimeMs });
          } catch {
            // removed meanwhile
          }
        }
      }
      return out;
    },
  };
}

/**
 * Stage one photo for `agentId` and the phone `deviceId` (TSK-30.1). The bytes must be a JPEG or HEIC
 * photo (sniffed, AVIF refused; TKT-19) of at most MAX_PHOTO_BYTES, and `mime` (the declared type) must be
 * what they are. The same bytes staged again keep one row and get a fresh expiry; a new photo past
 * MAX_STAGED_PER_AGENT unexpired ones is `too_many`. Writes go through writeTx; nothing is anchored.
 */
export async function stagePhoto(
  db: Db,
  store: StagingStore,
  input: { agentId: string; deviceId: string; bytes: Uint8Array; mime: string; now: Date },
): Promise<StageResult> {
  const { agentId, deviceId, bytes, mime, now } = input;
  if (bytes.length > MAX_PHOTO_BYTES) return { error: 'too_large' };
  const sniffed = sniffImage(bytes.subarray(0, SNIFF_BYTES));
  if (sniffed === null || !mimeMatches(sniffed, mime)) return { error: 'bad_type' };
  const sha256 = await sha256Hex(bytes);
  const path = store.pathOf(agentId, sha256);
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + STAGE_TTL_MS).toISOString();

  // The cheap count first, so a capped agent causes no disk write (TKT-30 review nit 7); checked again below,
  // under the write lock.
  const [prior] = await db
    .select({ expiresAt: stagedMedia.expiresAt })
    .from(stagedMedia)
    .where(and(eq(stagedMedia.sha256, sha256), eq(stagedMedia.agentId, agentId)));
  if (!prior || prior.expiresAt <= nowIso) {
    const [held] = await db
      .select({ n: count() })
      .from(stagedMedia)
      .where(and(eq(stagedMedia.agentId, agentId), gt(stagedMedia.expiresAt, nowIso), ne(stagedMedia.sha256, sha256)));
    if ((held?.n ?? 0) >= MAX_STAGED_PER_AGENT) return { error: 'too_many' };
  }

  const tmp = await store.prepare(path, bytes);
  let moved = false;
  try {
    const r = await writeTx(db, async (tx): Promise<StageResult> => {
      const [existing] = await tx
        .select({ expiresAt: stagedMedia.expiresAt, deviceId: stagedMedia.deviceId })
        .from(stagedMedia)
        .where(and(eq(stagedMedia.sha256, sha256), eq(stagedMedia.agentId, agentId)));
      if (!existing || existing.expiresAt <= nowIso) {
        // A new (or expired, so not counted) photo takes one of the agent's places.
        const [held] = await tx
          .select({ n: count() })
          .from(stagedMedia)
          .where(and(eq(stagedMedia.agentId, agentId), gt(stagedMedia.expiresAt, nowIso), ne(stagedMedia.sha256, sha256)));
        if ((held?.n ?? 0) >= MAX_STAGED_PER_AGENT) return { error: 'too_many' };
      }
      // An unexpired row keeps its phone (review #4): the binding never moves silently to another phone.
      const owner = existing && existing.expiresAt > nowIso ? existing.deviceId : deviceId;
      const row = { deviceId: owner, size: bytes.length, mime, path, createdAt: nowIso, expiresAt };
      if (existing) {
        await tx
          .update(stagedMedia)
          .set(row)
          .where(and(eq(stagedMedia.sha256, sha256), eq(stagedMedia.agentId, agentId)));
      } else {
        await tx.insert(stagedMedia).values({ sha256, agentId, ...row });
      }
      // Inside the write lock, so a sweep or a capture's clean-up of this path cannot interleave.
      await store.commit(tmp, path);
      moved = true;
      return { sha256, expiresAt };
    });
    return r;
  } finally {
    if (!moved) await store.discard(tmp);
  }
}

type Lookup = { agentId: string; deviceId?: string; sha256: string; now: Date };

/**
 * The staged bytes as they are on disk, without re-hashing (claimStaged re-hashes them for the capture).
 * Null when there is no unexpired row for this agent (and phone, when given) or the file is gone. Reads
 * at most MAX_PHOTO_BYTES + 1 bytes, so an oversized file is never read whole.
 */
export async function readStaged(db: Db, store: StagingStore, q: Lookup): Promise<Uint8Array | null> {
  if (!SHA.test(q.sha256)) return null;
  const conditions = [eq(stagedMedia.sha256, q.sha256), eq(stagedMedia.agentId, q.agentId), gt(stagedMedia.expiresAt, q.now.toISOString())];
  if (q.deviceId !== undefined) conditions.push(eq(stagedMedia.deviceId, q.deviceId));
  const [row] = await db.select({ path: stagedMedia.path }).from(stagedMedia).where(and(...conditions));
  if (!row) return null;
  return store.read(row.path, MAX_PHOTO_BYTES + 1);
}

/**
 * The staged bytes for `agentId` (and phone), re-hashed: null when missing, expired, another agent's or
 * phone's, or when the bytes no longer hash to `sha256` (TSK-30.1).
 */
export async function takeStaged(db: Db, store: StagingStore, q: Lookup): Promise<Uint8Array | null> {
  const bytes = await readStaged(db, store, q);
  if (!bytes || bytes.length > MAX_PHOTO_BYTES) return null;
  return (await sha256Hex(bytes)) === q.sha256 ? bytes : null;
}

/**
 * The staged bytes for the capture (EXE25): null when missing, expired or another agent's or phone's.
 * A copy whose bytes no longer hash to `sha256` (or that grew past MAX_PHOTO_BYTES) can only have changed
 * on the server, since the phone names only hashes the server confirmed: it is discarded (row and file),
 * logged as `stage.integrity_failed`, and read as missing, so the phone resends the bytes (409
 * media_not_staged) and the farmer never loses the photo (TP28).
 */
export async function claimStaged(db: Db, store: StagingStore, q: Lookup, log: { warn: (o: object, msg: string) => void }): Promise<Uint8Array | null> {
  const bytes = await readStaged(db, store, q);
  if (!bytes) return null;
  if (bytes.length <= MAX_PHOTO_BYTES && (await sha256Hex(bytes)) === q.sha256) return bytes;
  log.warn({ reason: 'hash_mismatch' }, 'stage.integrity_failed');
  await writeTx(db, async (tx) => {
    const gone = await tx
      .delete(stagedMedia)
      .where(and(eq(stagedMedia.sha256, q.sha256), eq(stagedMedia.agentId, q.agentId)))
      .returning({ path: stagedMedia.path });
    for (const { path } of gone) await store.remove(path);
  });
  return null;
}

/** Delete every expired staged row and its file (under the write lock). Resolves how many were removed. */
export async function sweepExpired(db: Db, store: StagingStore, now: Date): Promise<number> {
  return writeTx(db, async (tx) => {
    const gone = await tx.delete(stagedMedia).where(lte(stagedMedia.expiresAt, now.toISOString())).returning({ path: stagedMedia.path });
    for (const { path } of gone) await store.remove(path);
    return gone.length;
  });
}

/**
 * After a capture has committed (TSK-30.3): the staged copies it used are in the media store now, so
 * their rows and files are deleted.
 */
export async function consumeStaged(db: Db, store: StagingStore, q: { agentId: string; sha256s: readonly string[] }): Promise<void> {
  const hashes = [...new Set(q.sha256s)].filter((s) => SHA.test(s));
  if (hashes.length === 0) return;
  await writeTx(db, async (tx) => {
    const gone = await tx
      .delete(stagedMedia)
      .where(and(eq(stagedMedia.agentId, q.agentId), inArray(stagedMedia.sha256, hashes)))
      .returning({ path: stagedMedia.path });
    for (const { path } of gone) await store.remove(path);
  });
}

/**
 * The whole sweep (TKT-30 review #3): expired rows and their files, then, under the same write lock,
 * temp files and files with no row that are older than STAGE_TTL_MS (left by a crash between writing and
 * renaming, or by a transaction that failed after the rename). Younger files are left alone: a stage may
 * be writing them. Runs on every stage call, after every capture and at startup.
 */
export async function sweepStaging(db: Db, store: StagingStore, now: Date): Promise<{ expired: number; orphans: number }> {
  return writeTx(db, async (tx) => {
    const gone = await tx.delete(stagedMedia).where(lte(stagedMedia.expiresAt, now.toISOString())).returning({ path: stagedMedia.path });
    for (const { path } of gone) await store.remove(path);
    const owned = new Set((await tx.select({ path: stagedMedia.path }).from(stagedMedia)).map((r) => r.path));
    const cutoff = now.getTime() - STAGE_TTL_MS;
    let orphans = 0;
    for (const f of await store.list()) {
      if (owned.has(f.path) || f.mtimeMs > cutoff) continue;
      await store.remove(f.path);
      orphans++;
    }
    return { expired: gone.length, orphans };
  });
}

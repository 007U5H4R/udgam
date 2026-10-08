import { existsSync } from 'node:fs';
import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { sha256Hex } from '../crypto';
import { writeTx } from '../db/client';
import { seenMediaHashes } from './context';
import { MAX_PHOTO_BYTES } from './limits';
import { claimStaged, localStagingStore, MAX_STAGED_PER_AGENT, readStaged, stagePhoto, STAGE_TTL_MS, sweepExpired, sweepStaging, takeStaged, type StagingStore } from './staging';

// TC-093 (store half, TSK-30.1): staged photos belong to one agent and phone, expire after an hour, are
// capped at 12 per agent, and are never provenance (no anchor, never "seen" by photo_uniqueness).

let t: TempDb;
let store: StagingStore;
const NOW = new Date('2026-10-14T04:00:00.000Z');
const A = 'AG-STAGE-A';
const B = 'AG-STAGE-B';
const DEV_A = 'DV-AAAAAAAA';

beforeEach(async () => {
  t = await tempDb();
  store = localStagingStore(t.dir);
});
afterEach(async () => {
  await t.cleanup();
});

const stage = (bytes: Uint8Array, o: { agentId?: string; deviceId?: string; now?: Date; mime?: string } = {}) =>
  stagePhoto(t.db, store, { agentId: o.agentId ?? A, deviceId: o.deviceId ?? DEV_A, bytes, mime: o.mime ?? 'image/jpeg', now: o.now ?? NOW });

async function rows(): Promise<{ sha256: string; agent_id: string; path: string; expires_at: string }[]> {
  return (await t.client.execute('SELECT sha256, agent_id, path, expires_at FROM staged_media ORDER BY sha256')).rows as unknown as {
    sha256: string;
    agent_id: string;
    path: string;
    expires_at: string;
  }[];
}

const later = (ms: number) => new Date(NOW.getTime() + ms);

describe('stagePhoto (TC-093)', () => {
  it('TC-093 stores the bytes under DATA_DIR/staging/<agent>/<sha256>; they hash to the returned sha256; expiry is 1 h', async () => {
    const bytes = fakeJpeg('staged-1');
    const r = await stage(bytes);
    expect(r).toEqual({ sha256: await sha256Hex(bytes), expiresAt: '2026-10-14T05:00:00.000Z' });
    const [row] = await rows();
    expect(row).toMatchObject({ agent_id: A, path: join('staging', A, await sha256Hex(bytes)) });
    expect(await sha256Hex(new Uint8Array(await readFile(join(t.dir, row!.path))))).toBe(await sha256Hex(bytes));
    expect(STAGE_TTL_MS).toBe(3_600_000);
  });

  it('TC-093 the same bytes staged twice keep one row with a refreshed expiry', async () => {
    const bytes = fakeJpeg('twice');
    await stage(bytes);
    const again = await stage(bytes, { now: later(30 * 60_000) });
    expect(again).toMatchObject({ expiresAt: '2026-10-14T05:30:00.000Z' });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.expires_at).toBe('2026-10-14T05:30:00.000Z');
  });

  it('TC-093 the 13th unexpired photo of one agent → too_many; another agent is unaffected; an expired one frees a place', async () => {
    expect(MAX_STAGED_PER_AGENT).toBe(12);
    for (let i = 0; i < 12; i++) expect(await stage(fakeJpeg(`cap-${i}`))).toHaveProperty('sha256');
    expect(await stage(fakeJpeg('cap-12'))).toEqual({ error: 'too_many' });
    expect(await stage(fakeJpeg('cap-12'), { agentId: B })).toHaveProperty('sha256');
    // re-staging one of the twelve is a refresh, not a 13th
    expect(await stage(fakeJpeg('cap-3'))).toHaveProperty('sha256');
    // an hour and a second later the twelve have expired
    expect(await stage(fakeJpeg('cap-12'), { now: later(STAGE_TTL_MS + 1000) })).toHaveProperty('sha256');
    expect(existsSync(join(t.dir, 'staging', A, await sha256Hex(fakeJpeg('cap-12'))))).toBe(true);
  });

  it('TC-093 refuses 10 MB + 1 (too_large), a text file, AVIF and a declared type the bytes are not (bad_type); nothing is stored', async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await stage(big)).toEqual({ error: 'too_large' });
    expect(await stage(new TextEncoder().encode('just some text, not a photo'))).toEqual({ error: 'bad_type' });
    const avif = new Uint8Array(32);
    avif.set([0, 0, 0, 24], 0);
    avif.set(new TextEncoder().encode('ftypmif1\0\0\0\0avif'), 4);
    expect(await stage(avif, { mime: 'image/heic' })).toEqual({ error: 'bad_type' });
    expect(await stage(fakeJpeg('declared-heic'), { mime: 'image/heic' })).toEqual({ error: 'bad_type' });
    expect(await stage(new Uint8Array(0))).toEqual({ error: 'bad_type' });
    expect(await rows()).toEqual([]);
    expect(existsSync(join(t.dir, 'staging'))).toBe(false);
  });

  it('TC-093 anchors nothing and a staged hash is never in seenMediaHashes', async () => {
    const count = async () => Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n);
    const before = await count();
    const bytes = fakeJpeg('not-seen');
    const r = await stage(bytes);
    if (!('sha256' in r)) throw new Error('not staged');
    expect(await count()).toBe(before);
    expect(await seenMediaHashes(t.db, [r.sha256])).toEqual(new Set());
    expect(Number((await t.client.execute('SELECT COUNT(*) AS n FROM media')).rows[0]?.n)).toBe(0);
  });

  it('the table refuses INSERT OR REPLACE of a staged row (no-replace guard)', async () => {
    const r = await stage(fakeJpeg('guarded'));
    if (!('sha256' in r)) throw new Error('not staged');
    await expect(
      t.client.execute({
        sql: `INSERT OR REPLACE INTO staged_media (sha256, agent_id, device_id, size, mime, path, created_at, expires_at) VALUES (?, ?, 'DV-X', 1, 'image/jpeg', 'x', 'x', 'x')`,
        args: [r.sha256, A],
      }),
    ).rejects.toThrow(/UNIQUE/);
  });
});

describe('takeStaged / readStaged / sweepExpired (TC-093)', () => {
  it('TC-093 returns the bytes to the owning agent and phone only, while unexpired', async () => {
    const bytes = fakeJpeg('owned');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    expect(await takeStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256, now: later(60_000) })).toEqual(bytes);
    expect(await takeStaged(t.db, store, { agentId: A, sha256, now: later(60_000) })).toEqual(bytes);
    expect(await takeStaged(t.db, store, { agentId: B, sha256, now: later(60_000) })).toBeNull();
    expect(await takeStaged(t.db, store, { agentId: A, deviceId: 'DV-BBBBBBBB', sha256, now: later(60_000) })).toBeNull();
    expect(await takeStaged(t.db, store, { agentId: A, sha256: 'f'.repeat(64), now: later(60_000) })).toBeNull();
  });

  it('TC-093 after 1 h + 1 s: takeStaged → null, and sweepExpired removes the file and the row', async () => {
    const bytes = fakeJpeg('expires');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    const keep = fakeJpeg('fresh');
    await stage(keep, { now: later(30 * 60_000) });
    const expired = later(STAGE_TTL_MS + 1000);
    expect(await takeStaged(t.db, store, { agentId: A, sha256, now: expired })).toBeNull();
    expect(await sweepExpired(t.db, store, expired)).toBe(1);
    expect((await rows()).map((r) => r.sha256)).toEqual([await sha256Hex(keep)]);
    expect(existsSync(join(t.dir, 'staging', A, sha256))).toBe(false);
    expect(existsSync(join(t.dir, 'staging', A, await sha256Hex(keep)))).toBe(true);
  });

  it('TC-093 a file edited on disk: takeStaged → null (re-hashed); readStaged hands the edited bytes on for the boundary to refuse', async () => {
    const bytes = fakeJpeg('tampered');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    const edited = fakeJpeg('tampered!');
    await writeFile(join(t.dir, 'staging', A, sha256), edited);
    expect(await takeStaged(t.db, store, { agentId: A, sha256, now: NOW })).toBeNull();
    expect(await readStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256, now: NOW })).toEqual(edited);
  });

  it('a staged file that has vanished from disk reads as missing', async () => {
    const bytes = fakeJpeg('vanished');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    await store.remove(join('staging', A, sha256));
    expect(await readStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256, now: NOW })).toBeNull();
  });

  it('refuses an agent id that is not a safe path segment', async () => {
    await expect(stage(fakeJpeg('x'), { agentId: '../evil' })).rejects.toThrow();
  });
});

describe('TKT-30 review follow-ups (staging store)', () => {
  it('the store stays inside the exact staging folder: stagingX/… is refused (nit 6)', async () => {
    await expect(store.prepare(join('stagingX', A, 'a'.repeat(64)), fakeJpeg('x'))).rejects.toThrow('staged path is outside the staging area');
    await expect(store.read(join('staging-old', 'f'), 10)).rejects.toThrow('staged path is outside the staging area');
    await expect(store.read('staging', 10)).rejects.toThrow('staged path is outside the staging area');
  });

  it('a capped agent is refused before any file is written (nit 7)', async () => {
    for (let i = 0; i < MAX_STAGED_PER_AGENT; i++) await stage(fakeJpeg(`full-${i}`));
    const spy = vi.spyOn(store, 'prepare');
    expect(await stage(fakeJpeg('one-more'))).toEqual({ error: 'too_many' });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reads a staged file at its own size, at most max bytes (nit 8)", async () => {
    const bytes = fakeJpeg('sized');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    expect(await store.read(join('staging', A, sha256), MAX_PHOTO_BYTES + 1)).toEqual(bytes);
    expect(await store.read(join('staging', A, sha256), 4)).toEqual(bytes.subarray(0, 4));
  });

  it('staging the same bytes from a second phone keeps the first phone on an unexpired row (review #4)', async () => {
    const bytes = fakeJpeg('two-phones');
    const sha256 = await sha256Hex(bytes);
    await stage(bytes);
    await stage(bytes, { deviceId: 'DV-BBBBBBBB', now: later(60_000) });
    expect((await t.client.execute('SELECT device_id FROM staged_media')).rows.map((r) => r.device_id)).toEqual([DEV_A]);
    expect(await readStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256, now: later(120_000) })).toEqual(bytes);
    // once that row has expired (an hour after its refresh), the other phone may take it over
    await stage(bytes, { deviceId: 'DV-BBBBBBBB', now: later(60_000 + STAGE_TTL_MS + 1000) });
    expect((await t.client.execute('SELECT device_id FROM staged_media')).rows.map((r) => r.device_id)).toEqual(['DV-BBBBBBBB']);
  });

  it('claimStaged: intact bytes come back; a changed file is discarded (row and file) and logged, and reads as missing (EXE25)', async () => {
    const good = fakeJpeg('claim-good');
    const bad = fakeJpeg('claim-bad');
    await stage(good);
    await stage(bad);
    const badSha = await sha256Hex(bad);
    await writeFile(join(t.dir, 'staging', A, badSha), fakeJpeg('claim-bad-edited'));
    const log = { warn: vi.fn() };
    expect(await claimStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256: await sha256Hex(good), now: NOW }, log)).toEqual(good);
    expect(await claimStaged(t.db, store, { agentId: A, deviceId: DEV_A, sha256: badSha, now: NOW }, log)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith({ reason: 'hash_mismatch' }, 'stage.integrity_failed');
    expect((await rows()).map((r) => r.sha256)).toEqual([await sha256Hex(good)]);
    expect(existsSync(join(t.dir, 'staging', A, badSha))).toBe(false);
  });

  it('sweepStaging removes expired rows, and temp and row-less files older than the TTL; young files and owned files stay (review #3)', async () => {
    const kept = fakeJpeg('kept');
    await stage(kept, { now: later(STAGE_TTL_MS) });
    await stage(fakeJpeg('expired'));
    const dir = join(t.dir, 'staging', A);
    const old = (NOW.getTime() - 1000) / 1000; // older than an hour at the sweep below
    await mkdir(join(t.dir, 'staging', B), { recursive: true });
    const files = {
      oldTmp: join(dir, `${'1'.repeat(64)}.x.tmp`),
      oldOrphan: join(t.dir, 'staging', B, '2'.repeat(64)),
      youngTmp: join(dir, `${'3'.repeat(64)}.y.tmp`),
      youngOrphan: join(dir, '4'.repeat(64)),
    };
    for (const f of Object.values(files)) await writeFile(f, 'x');
    await utimes(files.oldTmp, old, old);
    await utimes(files.oldOrphan, old, old);
    const sweepAt = later(STAGE_TTL_MS + 1000);
    for (const f of [files.youngTmp, files.youngOrphan]) await utimes(f, sweepAt.getTime() / 1000 - 60, sweepAt.getTime() / 1000 - 60);

    expect(await sweepStaging(t.db, store, sweepAt)).toEqual({ expired: 1, orphans: 2 });
    expect((await rows()).map((r) => r.sha256)).toEqual([await sha256Hex(kept)]);
    expect(existsSync(join(dir, await sha256Hex(kept)))).toBe(true);
    expect(existsSync(files.oldTmp)).toBe(false);
    expect(existsSync(files.oldOrphan)).toBe(false);
    expect(existsSync(files.youngTmp)).toBe(true);
    expect(existsSync(files.youngOrphan)).toBe(true);
  });

  it('CR-003: the orphan scan (the folder walk) runs outside the write lock', async () => {
    await stage(fakeJpeg('held'));
    const walkedUnderLock: boolean[] = [];
    const watched: StagingStore = {
      ...store,
      async list() {
        // A writeTx refuses to nest at once, so this tells whether the walk holds the write lock.
        walkedUnderLock.push(await writeTx(t.db, async () => false).catch((e: Error) => /nested writeTx/.test(e.message)));
        return store.list();
      },
    };
    await sweepStaging(t.db, watched, later(STAGE_TTL_MS + 1000));
    expect(walkedUnderLock).toEqual([false]);
  });

  it('CR-003: a file that looked orphaned during the walk but was staged before the delete is kept', async () => {
    const bytes = fakeJpeg('restaged');
    const sha = await sha256Hex(bytes);
    const sweepAt = later(STAGE_TTL_MS + 1000);
    const abs = join(t.dir, store.pathOf(A, sha));
    await mkdir(join(t.dir, 'staging', A), { recursive: true });
    await writeFile(abs, bytes);
    const old = (NOW.getTime() - 1000) / 1000;
    await utimes(abs, old, old); // an old file with no row: an orphan when the walk sees it
    const racing: StagingStore = {
      ...store,
      async list() {
        const seen = await store.list();
        await stage(bytes, { now: sweepAt }); // the phone stages the same photo while the sweep is walking
        return seen;
      },
    };
    expect(await sweepStaging(t.db, racing, sweepAt)).toEqual({ expired: 0, orphans: 0 });
    expect(existsSync(abs)).toBe(true);
    expect((await rows()).map((r) => r.sha256)).toEqual([sha]);
  });

  it('sweepStaging with no staging folder yet does nothing', async () => {
    expect(await sweepStaging(t.db, store, NOW)).toEqual({ expired: 0, orphans: 0 });
  });
});

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { sha256Hex } from '../crypto';
import { seenMediaHashes } from './context';
import { MAX_PHOTO_BYTES } from './limits';
import { localStagingStore, MAX_STAGED_PER_AGENT, readStaged, stagePhoto, STAGE_TTL_MS, sweepExpired, takeStaged, type StagingStore } from './staging';

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

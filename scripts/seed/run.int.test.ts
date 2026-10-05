import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// TC-077 (technical-plan TSK-20.2): `pnpm seed` builds the Kodagu demo from nothing through the app's own
// functions, on a temporary DATA_DIR; a second run refuses; --reset rebuilds with the same counts.

// The env is read once, on first use: set DATA_DIR before the app's modules are imported (below).
const DATA_DIR = mkdtempSync(join(tmpdir(), 'udgam-seed-'));
process.env.DATA_DIR = DATA_DIR;
delete process.env.DATABASE_URL;
delete process.env.LEDGER_KEY_PATH;
process.env.REMOTE_SENSING_PROVIDER = 'fixture';
process.env.LOG_LEVEL = 'silent';

const { main, seed, SEED_NOT_EMPTY } = await import('./run');
const { SEED } = await import('./data');
const { closeDb, getDbClient, getDbReady } = await import('../../src/lib/db/client');
const { verifyChain } = await import('../../src/lib/ledger/hashchain');
const { checkpointStatement } = await import('../../src/lib/ledger/checkpoint');
const { merkleRoot } = await import('../../src/lib/ledger/merkle');
const { publishedKeys } = await import('../../src/lib/ledger/keys');
const { buildFeed } = await import('../../src/lib/ledger/feed');
const { verifyFeed } = await import('../../src/lib/ledger/proof');
const { bytesToHex, hexToBytes, verify } = await import('../../src/lib/crypto');

afterAll(() => {
  closeDb();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

/** The counts `pnpm seed` prints (TC-077), fixed literals from the data set. */
const COUNTS = {
  organisations: 2,
  users: 4,
  plots: 12,
  assignments: 15,
  devices: 2,
  pickings: { Verified: 27, 'Needs Review': 3 },
  overrides: 1,
  attestations: 1,
  batches: 1,
  transfers: 1,
  attacks: 4,
};

async function rows<T>(sql: string): Promise<T[]> {
  await getDbReady();
  return (await getDbClient().execute(sql)).rows as unknown as T[];
}

describe('TC-077 the Kodagu demo seed', () => {
  it('builds 1 FPO, 1 buyer, 12 plots, agents, phones, ~30 pickings and a transferred batch from nothing', { timeout: 240_000 }, async () => {
    const counts = await seed({});
    expect(counts).toMatchObject(COUNTS);

    const orgs = await rows<{ id: string; type: string; name: string }>('SELECT id, type, name FROM organisations ORDER BY type');
    expect(orgs.map((o) => [o.type, o.name])).toEqual([
      ['buyer', 'Western Ghats Green Coffee (demo buyer)'],
      ['fpo', 'Hosahalli Coffee Growers FPO'],
    ]);
    const users = await rows<{ id: string; role: string }>('SELECT id, role FROM user ORDER BY id');
    expect(users.map((u) => u.id).sort()).toEqual(SEED.users.map((u) => u.id).sort());

    // 30 accepted pickings: every final verdict Verified except P09's two (cloud), and Y01's last was
    // Needs Review at first (1.76x) and Verified by the office (a signed, anchored override).
    const events = await rows<{ boundary_status: string; final_verdict: string; n: number }>(
      'SELECT boundary_status, final_verdict, count(*) AS n FROM harvest_events GROUP BY 1, 2 ORDER BY 1, 2',
    );
    expect(events.map((e) => [e.boundary_status, e.final_verdict, Number(e.n)])).toEqual([
      ['accepted', 'Needs Review', 2],
      ['accepted', 'Verified', 28],
    ]);
    const runs = await rows<{ verdict: string; n: number }>('SELECT verdict, count(*) AS n FROM verification_runs GROUP BY 1 ORDER BY 1');
    expect(runs.map((r) => [r.verdict, Number(r.n)])).toEqual([
      ['Needs Review', 3],
      ['Verified', 27],
    ]);
  });

  it('every provenance row is anchored to a ledger entry; the chain and every checkpoint verify', async () => {
    const db = await getDbReady();
    const tables = await rows<{ name: string }>(
      "SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'anchor_seq')",
    );
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['plots', 'devices', 'harvest_events', 'verification_runs', 'admin_overrides', 'attestations', 'batches', 'custody_transfers']));
    for (const { name } of tables) {
      const orphans = await rows<{ n: number }>(`SELECT count(*) AS n FROM "${name}" t WHERE t.anchor_seq IS NULL OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.seq = t.anchor_seq)`);
      expect(Number(orphans[0]!.n), `${name} rows without a valid anchor_seq`).toBe(0);
    }

    expect(await verifyChain(db)).toEqual({ ok: true });
    const [{ head }] = (await rows<{ head: number }>('SELECT max(seq) AS head FROM ledger_entries')) as [{ head: number }];
    const cps = await rows<{ id: number; from_seq: number; to_seq: number; merkle_root: string; prev_checkpoint_hash: string; ts: string; key_id: string; signature: string }>(
      'SELECT * FROM ledger_checkpoints ORDER BY id',
    );
    expect(cps.at(-1)!.to_seq).toBe(Number(head)); // every entry is sealed
    const { keys } = await publishedKeys();
    for (const cp of cps) {
      const leaves = await rows<{ entry_hash: string }>(`SELECT entry_hash FROM ledger_entries WHERE seq BETWEEN ${cp.from_seq} AND ${cp.to_seq} ORDER BY seq`);
      expect(bytesToHex(await merkleRoot(leaves.map((l) => hexToBytes(l.entry_hash))))).toBe(cp.merkle_root);
      const key = keys.find((k) => k.kid === cp.key_id)!;
      const statement = checkpointStatement({ id: cp.id, fromSeq: cp.from_seq, toSeq: cp.to_seq, merkleRoot: cp.merkle_root, prevCheckpointHash: cp.prev_checkpoint_hash, ts: cp.ts });
      expect(await verify(key, statement, cp.signature)).toBe(true);
    }

    // the seeded batch's public proof feed verifies end to end with the published key
    const [batch] = await rows<{ id: string }>('SELECT id FROM batches');
    const feed = await buildFeed(db, batch!.id);
    expect(await verifyFeed(feed, keys)).toMatchObject({ ok: true });
  });

  it('seeded photos come from the demo photo set, labelled generated-demo, and no two share a SHA-256', async () => {
    const media = await rows<{ sha256: string; source: string | null; exif: string }>('SELECT sha256, source, exif FROM media');
    expect(media.length).toBeGreaterThanOrEqual(30);
    expect(new Set(media.map((m) => m.sha256)).size).toBe(media.length);
    expect(media.every((m) => m.source === 'generated-demo')).toBe(true);
    expect(media.every((m) => (JSON.parse(m.exif) as { make?: string; hadOffset: boolean }).make === 'Udgam demo')).toBe(true);
    expect(media.every((m) => (JSON.parse(m.exif) as { hadOffset: boolean }).hadOffset)).toBe(true);
  });

  it('no farmer name or identifier reaches any ledger payload (EV16)', async () => {
    const payloads = (await rows<{ payload: string }>('SELECT payload FROM ledger_entries')).map((r) => r.payload).join('\n');
    for (const p of SEED.plots) {
      expect(payloads).not.toContain(p.farmer.name);
      if (p.farmer.identifier) expect(payloads).not.toContain(p.farmer.identifier);
    }
    const farmers = await rows<{ name: string }>('SELECT name FROM farmers ORDER BY name');
    expect(farmers.map((f) => f.name)).toEqual(SEED.plots.map((p) => p.farmer.name).sort());
  });

  it('writes the generated passwords only to DATA_DIR/seed-credentials.txt (0600) and the phone keys to seed-keys/', () => {
    const file = join(DATA_DIR, 'seed-credentials.txt');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
    expect(lines.map((l) => l.split('\t')[1]).sort()).toEqual(SEED.users.map((u) => u.email).sort());
    for (const l of lines) expect(l.split('\t')[2]!.length).toBeGreaterThanOrEqual(20);
    for (const agent of ['agent1', 'agent2']) expect(statSync(join(DATA_DIR, 'seed-keys', `${agent}.json`)).mode & 0o777).toBe(0o600);
  });

  it('a second run on the same DATA_DIR refuses: not empty — use --reset', async () => {
    await expect(seed({})).rejects.toThrow(SEED_NOT_EMPTY);
    expect(SEED_NOT_EMPTY).toBe('DATA_DIR is not empty — use --reset');
  });

  it('--reset wipes the database, media and seed files and rebuilds with the same counts', { timeout: 240_000 }, async () => {
    const before = await rows<{ id: string }>('SELECT id FROM plots');
    const counts = await seed({ reset: true });
    expect(counts).toMatchObject(COUNTS);
    const after = await rows<{ id: string }>('SELECT id FROM plots');
    expect(after).toHaveLength(12);
    expect(after.some((p) => before.some((b) => b.id === p.id))).toBe(false); // a new database, not the old rows
    expect(await verifyChain(await getDbReady())).toEqual({ ok: true });
  });

  it('`pnpm seed --reset` prints one line: the counts and the credentials file path, never a password', { timeout: 240_000 }, async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await main(['--reset'])).toBe(0);
      expect(out).toHaveBeenCalledTimes(1);
      const printed = String(out.mock.calls[0]![0]);
      expect(JSON.parse(printed)).toMatchObject({ seeded: 'kodagu-demo', ...COUNTS, credentials: join(DATA_DIR, 'seed-credentials.txt') });
      const passwords = readFileSync(join(DATA_DIR, 'seed-credentials.txt'), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split('\t')[2]!);
      for (const p of passwords) expect(printed).not.toContain(p);
    } finally {
      out.mockRestore();
    }
  });
});

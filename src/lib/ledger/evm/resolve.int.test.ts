import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { evmAnchors } from '../../db/schema';
import { setOnAppended } from '../hashchain';
import { createEvmLedger, evmFieldsFor } from './adapter';
import { ResolveRefused, resolveFailedAnchor } from './resolve';
import { fakeRegistry, type FakeRegistry } from './testing/fake-registry';

// TASK-25 fix round 1 (quality finding 5, spec Minor 3): a `failed` anchor halts anchoring, and the
// operator path out is `pnpm ledger:evm:resolve`: one immutable resolution on the failed row, after
// which anchoring resumes with the next seq. The row stays failed (proofs and the audit keep saying so).

const ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const execFileAsync = promisify(execFile);
const FOREIGN = 'f'.repeat(64);
const REASON = 'registry seq 1 written by a test key; investigated, see incident INC-7';
const NOW = new Date('2026-10-05T10:00:00.000Z');

let t: TempDb;
let reg: FakeRegistry;
let previousHook: ReturnType<typeof setOnAppended>;
beforeEach(async () => {
  previousHook = setOnAppended(undefined);
  t = await tempDb();
  reg = fakeRegistry();
  reg.hashes.set(1, FOREIGN); // someone else's hash already at seq 1
});
afterEach(async () => {
  setOnAppended(previousHook);
  await t.cleanup();
});

const rows = () => t.db.select().from(evmAnchors).orderBy(asc(evmAnchors.seq));
const exec = (sql: string, args: (string | number | null)[] = []) => t.client.execute({ sql, args });

async function failedAtSeq1() {
  const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
  for (let i = 1; i <= 3; i++) await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: `P-${i}` }));
  expect(await ledger.anchorPending()).toMatchObject({ anchored: 0, stoppedAt: { seq: 1 } });
  return ledger;
}

describe('a failed anchor halts anchoring until resolved', () => {
  it('halted passes write nothing (no attempts, no last_error on the next row) and send nothing', async () => {
    const ledger = await failedAtSeq1();
    const appendsBefore = reg.calls.append;
    for (let i = 0; i < 3; i++) expect(await ledger.anchorPending()).toMatchObject({ anchored: 0, pending: 2, stoppedAt: { seq: 2 } });
    expect(reg.calls.append).toBe(appendsBefore);
    expect((await rows()).map((r) => [r.seq, r.status, r.attempts, r.lastError === null])).toEqual([
      [1, 'failed', 1, false],
      [2, 'pending', 0, true],
      [3, 'pending', 0, true],
    ]);
  });

  it('resolveFailedAnchor records the one resolution; anchoring resumes at the next seq; seq 1 stays failed', async () => {
    const ledger = await failedAtSeq1();
    expect(await resolveFailedAnchor(t.db, 1, `  ${REASON}  `, NOW)).toEqual({ seq: 1, resolution: REASON, resolvedAt: '2026-10-05T10:00:00.000Z' });
    expect(await ledger.anchorPending()).toEqual({ anchored: 2, pending: 0 });
    const all = await rows();
    expect(all.map((r) => [r.seq, r.status])).toEqual([
      [1, 'failed'],
      [2, 'anchored'],
      [3, 'anchored'],
    ]);
    expect(all[0]).toMatchObject({ resolution: REASON, resolvedAt: '2026-10-05T10:00:00.000Z' });
    expect(reg.hashes.get(1)).toBe(FOREIGN);
    expect((await evmFieldsFor(t.db, [1])).get(1)).toEqual({ status: 'failed' });
  });

  it('refuses: a second resolution, a non-failed row, an unknown seq, a short reason', async () => {
    await failedAtSeq1();
    await expect(resolveFailedAnchor(t.db, 1, 'too short')).rejects.toThrow(/at least 10 characters/);
    await resolveFailedAnchor(t.db, 1, REASON, NOW);
    await expect(resolveFailedAnchor(t.db, 1, `${REASON} again`)).rejects.toThrow(/already resolved at 2026-10-05T10:00:00.000Z/);
    await expect(resolveFailedAnchor(t.db, 2, REASON)).rejects.toThrow(/seq 2 is pending, not failed/);
    await expect(resolveFailedAnchor(t.db, 99, REASON)).rejects.toBeInstanceOf(ResolveRefused);
    await expect(resolveFailedAnchor(t.db, 0, REASON)).rejects.toThrow(/positive integer/);
  });
});

describe('database guards on resolution (migration 0023), attempted in raw SQL', () => {
  it('a failed row takes exactly one resolution, then nothing changes again', async () => {
    await failedAtSeq1();
    await expect(exec(`UPDATE evm_anchors SET status = 'pending' WHERE seq = 1`)).rejects.toThrow(/terminal/);
    await expect(exec(`UPDATE evm_anchors SET attempts = 9 WHERE seq = 1`)).rejects.toThrow(/terminal/);
    await expect(exec(`UPDATE evm_anchors SET resolution = 'short', resolved_at = ? WHERE seq = 1`, [NOW.toISOString()])).rejects.toThrow(/terminal/);
    await expect(exec(`UPDATE evm_anchors SET resolution = ? WHERE seq = 1`, [REASON])).rejects.toThrow(/terminal/); // no resolved_at
    await exec(`UPDATE evm_anchors SET resolution = ?, resolved_at = ? WHERE seq = 1`, [REASON, NOW.toISOString()]);
    await expect(exec(`UPDATE evm_anchors SET resolution = ? WHERE seq = 1`, [`${REASON}!`])).rejects.toThrow(/terminal/);
    await expect(exec(`UPDATE evm_anchors SET resolution = NULL, resolved_at = NULL WHERE seq = 1`)).rejects.toThrow(/terminal/);
    await expect(exec(`DELETE FROM evm_anchors WHERE seq = 1`)).rejects.toThrow(/never deleted/);
  });

  it('only a failed row can carry a resolution, and rows are inserted without one', async () => {
    await failedAtSeq1();
    await expect(exec(`UPDATE evm_anchors SET resolution = ?, resolved_at = ? WHERE seq = 2`, [REASON, NOW.toISOString()])).rejects.toThrow(/only a failed evm anchor/);
    await writeTx(t.db, (tx) => createEvmLedger({ db: t.db, registry: async () => reg }).append(tx, 'plot_registered', { plotId: 'P-4' }));
    await exec('PRAGMA foreign_keys = OFF');
    await expect(exec(`INSERT INTO evm_anchors (seq, status, attempts, updated_at, resolution, resolved_at) VALUES (50, 'pending', 0, ?, ?, ?)`, [NOW.toISOString(), REASON, NOW.toISOString()])).rejects.toThrow(
      /inserted pending/,
    );
  });
});

describe('pnpm ledger:evm:resolve', () => {
  const cli = (args: string[]) =>
    execFileAsync(TSX, ['scripts/ledger-evm-resolve.ts', ...args], {
      cwd: ROOT,
      timeout: 120_000,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATA_DIR: t.dir, DATABASE_URL: t.url, LOG_LEVEL: 'silent' } as unknown as NodeJS.ProcessEnv,
    }).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
    );

  it('records the resolution (exit 0), refuses a second one (exit 1), and rejects bad usage (exit 2)', async () => {
    await failedAtSeq1();
    const ok = await cli(['--seq=1', `--reason=${REASON}`]);
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('resolved: seq 1');
    expect((await rows())[0]).toMatchObject({ status: 'failed', resolution: REASON });

    const again = await cli(['--seq=1', `--reason=${REASON}`]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('refused: seq 1 was already resolved');

    const usage = await cli(['--seq=one']);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain('usage: pnpm ledger:evm:resolve');
  }, 120_000);
});

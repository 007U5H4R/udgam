import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASE_TIMEOUT_MS } from '../run';
import { CLEAN_ROOM_TIMEOUT_MS, cleanRoom, runProofSuite } from './proof';

// TASK-19 follow-up (review findings 6, 7): the clean-room child never outlives the case watchdog,
// and a child that fails with non-JSON output surfaces its own error, not a JSON SyntaxError.
describe('cleanRoom child process', () => {
  const withScript = async (body: string, run: (cli: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-cleanroom-child-'));
    try {
      const cli = join(dir, 'child.ts');
      writeFileSync(cli, body);
      await run(cli);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('is killed before the 30 s case watchdog fires', async () => {
    expect(CLEAN_ROOM_TIMEOUT_MS).toBeLessThan(CASE_TIMEOUT_MS);
    await withScript('setTimeout(() => {}, 60_000);\n', async (cli) => {
      const started = Date.now();
      await expect(cleanRoom(['--batch', 'x'], { cli, timeoutMs: 1_000 })).rejects.toMatchObject({ killed: true });
      expect(Date.now() - started).toBeLessThan(15_000);
    });
  }, 30_000);

  it('rethrows the original error when a failing child prints non-JSON', async () => {
    await withScript("process.stdout.write('not json');\nprocess.stderr.write('boom from the child');\nprocess.exitCode = 1;\n", async (cli) => {
      const err = await cleanRoom(['--vectors', 'x'], { cli }).catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(SyntaxError);
      expect(String((err as { stderr?: string }).stderr)).toContain('boom from the child');
    });
  }, 30_000);

  it('a successful child with non-JSON output is an error that says so', async () => {
    await withScript("process.stdout.write('not json');\n", async (cli) => {
      await expect(cleanRoom(['--batch', 'x'], { cli })).rejects.toThrow(/non-JSON output: not json/);
    });
  }, 30_000);
});

// TSK-15.8 / TSK-18.6: the harness proof suite (EVAL-058–063, EVAL-066 Node half) with both
// verifiers — the library verifier and the clean-room checker (a child process).

describe('runProofSuite (EVAL-058–063, 066)', () => {
  it('both verifiers pass the intact 50-event batch at 100 % coverage and reject every tamper at its step', async () => {
    const results = await runProofSuite();
    const byId = new Map(results.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual(['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066']);

    const intact = byId.get('EVAL-058')!;
    expect(intact.status, intact.detail).toBe('passed');
    expect(intact.metrics).toMatchObject({ coverage: 1, cleanRoomCoverage: 1 });
    expect(intact.metrics!.verified).toBe(intact.metrics!.closureEntries);
    expect(intact.metrics!.cleanRoomVerified).toBe(intact.metrics!.closureEntries);
    expect(intact.metrics!.closureEntries).toBeGreaterThanOrEqual(5 + 1 + 50 * 2 + 1 + 1 + 1 + 1);
    expect(intact.metrics!.checkpoints).toBeGreaterThanOrEqual(2); // automatic at 100 plus on demand
    expect(intact.metrics!.uncheckpointedBeforeFeed).toBeGreaterThan(0);

    // The S6 score over all seven variants (including wrong-short-hash, which no harness case owns).
    expect(intact.score).toMatchObject({ coverage: { lib: 1, cleanRoom: 1 }, tamperRejected: { lib: 1, cleanRoom: 1 }, cf04: { fired: false, variants: [] } });
    expect(intact.score!.perVariant.map((v) => v.variant)).toEqual([
      'payload-field',
      'merkle-sibling',
      'checkpoint-signature',
      'other-key',
      'dropped-entry',
      'reordered-entries',
      'wrong-short-hash',
    ]);
    expect(intact.score!.perVariant.every((v) => v.stepMatches)).toBe(true);

    const steps: Record<string, [string, string][]> = {
      'EVAL-059': [['payload-field', 'payload-hash']],
      'EVAL-060': [['merkle-sibling', 'merkle-path']],
      'EVAL-061': [['checkpoint-signature', 'checkpoint-signature']],
      'EVAL-062': [['other-key', 'unknown-key']],
      'EVAL-063': [
        ['dropped-entry', 'closure-incomplete'],
        ['reordered-entries', 'merkle-path'],
      ],
    };
    for (const [id, expected] of Object.entries(steps)) {
      const r = byId.get(id)!;
      expect(r.status, id).toBe('passed');
      expect(r.variants.map((v) => [v.variant, v.lib.step]), id).toEqual(expected);
      expect(r.variants.map((v) => [v.variant, v.cleanRoom.step]), id).toEqual(expected);
      expect(r.variants.every((v) => v.lib.rejected && v.cleanRoom.rejected && v.stepMatches), id).toBe(true);
    }

    const vectors = byId.get('EVAL-066')!;
    expect(vectors.status, vectors.detail).toBe('passed');
    expect(vectors.detail).toMatch(/clean-room/);

    for (const r of results) expect(r.cleanRoom.status, r.id).toBe('ran');
    expect(results.every((r) => r.suite === 'harness-proof')).toBe(true);
  }, 180_000);
});

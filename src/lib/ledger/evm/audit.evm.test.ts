import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { evmWorld, type EvmWorld } from '../../../../tests/helpers/evm-world';
import { writeTx } from '../../db/client';
import { setOnAppended } from '../hashchain';
import { createEvmLedger } from './adapter';
import { auditLedger } from './audit';

// EVAL-104 · TC-083: a hash-chain row altered after on-chain anchoring is detected. Anchor 10 entries
// through the EVM adapter, then — in this TEST database only — drop the append-only trigger and alter
// rows directly. `pnpm ledger:audit` compares each entry with registry.entryHash(seq) and exits non-zero
// naming the mismatched seqs.

const ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const execFileAsync = promisify(execFile);
const rpcUrl = inject('anvilRpcUrl');

let w: EvmWorld;
let previousHook: ReturnType<typeof setOnAppended>;
beforeAll(async () => {
  previousHook = setOnAppended(undefined);
  w = await evmWorld(rpcUrl);
  const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
  const add = (i: number) => writeTx(w.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: `P-${i}`, areaHa: i }));
  for (let i = 1; i <= 10; i++) await add(i);
  expect(await ledger.anchorPending()).toEqual({ anchored: 10, pending: 0 });
  // Two more entries whose anchor lags the commit (never sent here).
  await add(11);
  await add(12);
});
afterAll(async () => {
  setOnAppended(previousHook);
  await w?.cleanup();
});

const audit = () =>
  execFileAsync(TSX, ['scripts/ledger-audit.ts'], {
    cwd: ROOT,
    timeout: 120_000,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATA_DIR: w.dir, DATABASE_URL: w.url, ANVIL_RPC_URL: rpcUrl, LOG_LEVEL: 'silent' } as unknown as NodeJS.ProcessEnv,
  }).then(
    (r) => ({ code: 0, ...r }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

describe('EVAL-104: ledger audit against BatchRegistry', () => {
  it('an intact ledger audits clean: 10 compared, 2 not on chain yet, exit 0', async () => {
    const r = await auditLedger(w.db, w.registry);
    expect(r).toMatchObject({ ok: true, entries: 12, compared: 10, pendingNotOnChain: 2, mismatches: [] });
    const cli = await audit();
    expect(cli.code, cli.stderr).toBe(0);
    expect(cli.stdout).toContain('every anchored entry matches');
  });

  it('a payload altered after anchoring (seq 4) and an entry hash rewritten (seq 7) are named; exit 1', async () => {
    // TEST DB ONLY: lift the append-only guard (migration 0001) to simulate a tampering writer.
    await w.client.execute('DROP TRIGGER ledger_no_update');
    await w.client.execute(`UPDATE ledger_entries SET payload = '{"areaHa":400,"plotId":"P-4"}' WHERE seq = 4`);
    await w.client.execute({ sql: 'UPDATE ledger_entries SET entry_hash = ? WHERE seq = 7', args: ['e'.repeat(64)] });

    const r = await auditLedger(w.db, w.registry);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual([
      { seq: 4, reasons: ['recomputed-entry-hash-differs-from-chain'] },
      { seq: 7, reasons: ['stored-entry-hash-differs-from-chain'] },
    ]);

    const cli = await audit();
    expect(cli.code).toBe(1);
    expect(cli.stderr).toContain('mismatched seqs: 4, 7');
  });
});

describe('EVAL-104: a ledger entry deleted below the chain head is named, even with pending entries after the head', () => {
  it('chain 1–10, ledger 1–12, seq 5 deleted → ok=false naming seq 5 (on-chain-but-missing-from-ledger); exit 1', async () => {
    const d = await evmWorld(rpcUrl);
    try {
      const ledger = createEvmLedger({ db: d.db, registry: async () => d.registry });
      const add = (i: number) => writeTx(d.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: `P-${i}`, areaHa: i }));
      for (let i = 1; i <= 10; i++) await add(i);
      expect(await ledger.anchorPending()).toEqual({ anchored: 10, pending: 0 });
      await add(11);
      await add(12);

      // TEST DB ONLY: lift the no-delete guards (migrations 0001, 0020) and the FKs to simulate a deleting writer.
      await d.client.execute('PRAGMA foreign_keys = OFF');
      await d.client.execute('DROP TRIGGER ledger_no_delete');
      await d.client.execute('DROP TRIGGER evm_anchors_no_delete');
      await d.client.execute('DELETE FROM evm_anchors WHERE seq = 5');
      await d.client.execute('DELETE FROM ledger_entries WHERE seq = 5');

      const r = await auditLedger(d.db, d.registry);
      expect(r).toMatchObject({ ok: false, entries: 11, compared: 9, pendingNotOnChain: 2 });
      expect(r.mismatches).toEqual([{ seq: 5, reasons: ['on-chain-but-missing-from-ledger'] }]);

      const cli = await execFileAsync(TSX, ['scripts/ledger-audit.ts'], {
        cwd: ROOT,
        timeout: 120_000,
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATA_DIR: d.dir, DATABASE_URL: d.url, ANVIL_RPC_URL: rpcUrl, LOG_LEVEL: 'silent' } as unknown as NodeJS.ProcessEnv,
      }).then(
        () => ({ code: 0, stderr: '' }),
        (e: { code: number; stderr: string }) => ({ code: e.code, stderr: e.stderr }),
      );
      expect(cli.code).toBe(1);
      expect(cli.stderr).toContain('mismatched seqs: 5');
      expect(cli.stderr).toContain('seq 5: on-chain-but-missing-from-ledger');
    } finally {
      await d.cleanup();
    }
  });
});

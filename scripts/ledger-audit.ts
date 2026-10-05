// `pnpm ledger:audit` (technical-plan TSK-24.8, EVAL-104): compare every ledger entry with the hash
// BatchRegistry holds at its seq (stored entry_hash and the hash recomputed from the stored row), using
// DATABASE_URL, ANVIL_RPC_URL and DATA_DIR/evm/deployment.json. Read-only: no key is loaded. Exits 0 when
// every anchored entry matches, 1 naming each mismatched seq, 2 when the audit could not run.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/lib/config/env';
import { closeDb, getDbReady } from '../src/lib/db/client';
import { auditLedger, type AuditReport } from '../src/lib/ledger/evm/audit';
import { createRegistryClient } from '../src/lib/ledger/evm/client';
import { evmPaths, readDeployment } from '../src/lib/ledger/evm/deployment';

export function auditLines(r: AuditReport): string[] {
  const head = `ledger audit: chain ${r.chainId}, registry ${r.registry}: ${r.entries} entries, ${r.compared} compared with the chain, ${r.pendingNotOnChain} not on chain yet`;
  if (r.ok) return [`${head}; every anchored entry matches`];
  return [
    `${head}; ${r.mismatches.length} MISMATCH(ES)`,
    `mismatched seqs: ${r.mismatches.map((m) => m.seq).join(', ')}`,
    ...r.mismatches.map((m) => `  seq ${m.seq}: ${m.reasons.join(', ')}`),
  ];
}

export async function main(): Promise<number> {
  const paths = evmPaths(env);
  try {
    const deployment = await readDeployment(paths.deploymentPath);
    const client = createRegistryClient({ rpcUrl: paths.rpcUrl, deployment });
    const report = await auditLedger(await getDbReady(), client);
    const lines = auditLines(report);
    for (const l of lines) (report.ok ? console.log : console.error)(l);
    return report.ok ? 0 : 1;
  } catch (e) {
    console.error(`error: the ledger audit could not run: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return 2;
  } finally {
    closeDb();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

// `pnpm ledger:evm:resolve --seq=N --reason="…"` (TASK-25 fix round 1; docs/proof-feed.md §13.4): record
// the operator's one resolution of a `failed` EVM anchor, so anchoring resumes with the next seq. Uses
// DATABASE_URL only: no chain access and no key. Exits 0 when recorded, 1 when refused (not failed,
// already resolved, no reason), 2 on a usage or database error.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDbReady } from '../src/lib/db/client';
import { ResolveRefused, resolveFailedAnchor } from '../src/lib/ledger/evm/resolve';

export function parseResolveArgs(argv: string[]): { seq: number; reason: string } {
  let seq: number | undefined;
  let reason: string | undefined;
  for (const a of argv) {
    const m = /^--(seq|reason)=([\s\S]*)$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a.split('=')[0]}`);
    if (m[1] === 'seq') seq = /^\d+$/.test(m[2]!) ? Number(m[2]) : NaN;
    else reason = m[2];
  }
  if (seq === undefined || !Number.isSafeInteger(seq) || seq < 1) throw new Error('--seq=N (a positive integer) is required');
  if (reason === undefined) throw new Error('--reason="…" is required');
  return { seq, reason };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: { seq: number; reason: string };
  try {
    args = parseResolveArgs(argv.filter((a) => a !== '--'));
  } catch (e) {
    console.error(`usage: pnpm ledger:evm:resolve --seq=N --reason="why the mismatch is understood": ${(e as Error).message}`);
    return 2;
  }
  try {
    const r = await resolveFailedAnchor(await getDbReady(), args.seq, args.reason);
    console.log(`resolved: seq ${r.seq} at ${r.resolvedAt}; anchoring resumes with the next seq (the seq stays failed in proofs and the audit)`);
    return 0;
  } catch (e) {
    if (e instanceof ResolveRefused) {
      console.error(`refused: ${e.message}`);
      return 1;
    }
    console.error(`error: could not record the resolution: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
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

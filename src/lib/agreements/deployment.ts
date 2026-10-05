import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

// Where the escrow lives (TKT-25). SERVER-ONLY. DATA_DIR/evm/agreements.json is written by
// `pnpm agreements:deploy` (scripts/agreements-deploy.ts) and is git-ignored with DATA_DIR. It sits beside
// TKT-24's deployment.json (BatchRegistry) and shares its operator key, so escrow works under either
// ledger adapter.

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const EscrowDeploymentSchema = z.object({
  chainId: z.number().int().positive(),
  token: address,
  escrow: address,
  operator: address,
  deployedAtBlock: z.number().int().nonnegative(),
});

export type EscrowDeployment = { chainId: number; token: `0x${string}`; escrow: `0x${string}`; operator: `0x${string}`; deployedAtBlock: number };

export const escrowDeploymentPath = (dataDir: string): string => resolve(join(dataDir, 'evm', 'agreements.json'));

export async function readEscrowDeployment(path: string): Promise<EscrowDeployment> {
  return EscrowDeploymentSchema.parse(JSON.parse(await readFile(path, 'utf8'))) as EscrowDeployment;
}

/** Atomic write (temp file + rename), so a reader never sees half a deployment. */
export async function writeEscrowDeployment(path: string, d: EscrowDeployment): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(EscrowDeploymentSchema.parse(d), null, 2)}\n`);
  await rename(tmp, path);
}

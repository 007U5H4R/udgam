import type { TestProject } from 'vitest/node';
import { forgeBuild, foundryBin, startAnvil, type AnvilHandle } from '../foundry';

// Global setup of the `evm` vitest project (TSK-24.4): fail loudly if the pinned Foundry is missing
// (never skip), compile the contracts once, and start one shared Anvil on a free port. Each test deploys
// its own BatchRegistry with its own operator key (tests/helpers/evm-world.ts), so tests never share a
// registry's seq counter. Anvil is killed by PID in teardown.

declare module 'vitest' {
  export interface ProvidedContext {
    anvilRpcUrl: string;
  }
}

let anvil: AnvilHandle | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  foundryBin('anvil');
  foundryBin('forge');
  foundryBin('cast');
  await forgeBuild();
  anvil = await startAnvil();
  project.provide('anvilRpcUrl', anvil.rpcUrl);
  return async () => {
    await anvil?.stop();
    anvil = undefined;
  };
}

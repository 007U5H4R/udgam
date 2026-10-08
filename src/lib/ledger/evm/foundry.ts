import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createWalletClient, parseEther, type Address, type PublicClient, type Transport } from 'viem';

// Foundry tooling for scripts, the eval harness and EVM tests (docs/spikes/foundry.md §7). Never imported
// by the app. Binaries are the pinned Foundry 1.8.3 that scripts/cloud-setup.sh installs in
// ~/.foundry/bin (not on PATH), called by absolute path. Anvil runs on a free port with chain id 31337,
// readiness is polled with `cast chain-id`, and teardown kills it by PID (never pkill -f). Children get a
// minimal environment (HOME only, plus what a caller passes explicitly), never the parent's variables.

const execFileAsync = promisify(execFile);

export const FOUNDRY_VERSION = '1.8.3';
export const ANVIL_CHAIN_ID = 31337;
export const CONTRACTS_DIR = resolve(fileURLToPath(new URL('../../../../contracts', import.meta.url)));

export class FoundryMissing extends Error {
  constructor(name: string, path: string) {
    super(`${name} not found at ${path}: run \`bash scripts/cloud-setup.sh\` to install the pinned Foundry ${FOUNDRY_VERSION} (docs/spikes/foundry.md)`);
  }
}

export type FoundryTool = 'anvil' | 'forge' | 'cast';

/** Absolute path of a pinned Foundry binary; throws FoundryMissing (never skips) when it is absent. */
export function foundryBin(name: FoundryTool, home: string = homedir()): string {
  const path = join(home, '.foundry', 'bin', name);
  if (!existsSync(path)) throw new FoundryMissing(name, path);
  return path;
}

/** The environment Foundry children get: HOME (forge reads solc from ~/.svm) and nothing else by default. */
export const foundryEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ HOME: homedir(), ...extra }) as unknown as NodeJS.ProcessEnv;

/** A TCP port that was free a moment ago on 127.0.0.1. */
export function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? ok(port) : fail(new Error('no free port'))));
    });
  });
}

export type AnvilHandle = {
  rpcUrl: string;
  port: number;
  pid: number;
  /** SIGTERM by PID (anvil writes `--state` on a clean exit), SIGKILL after 5 s. Safe to call twice. */
  stop(): Promise<void>;
};

export type AnvilOptions = {
  /** Default: a free port. */
  port?: number;
  /** `--state <file>`: load the chain from this file at start and write it back on exit. */
  statePath?: string;
  /** How long to wait for the RPC (default 20 s). */
  readyTimeoutMs?: number;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function exited(child: ChildProcess): Promise<void> {
  return new Promise((r) => {
    if (child.exitCode !== null || child.signalCode !== null) r();
    else child.once('exit', () => r());
  });
}

/** Start anvil and resolve once `cast chain-id` answers 31337. */
export async function startAnvil(opts: AnvilOptions = {}): Promise<AnvilHandle> {
  const anvil = foundryBin('anvil');
  const cast = foundryBin('cast');
  const port = opts.port ?? (await freePort());
  const rpcUrl = `http://127.0.0.1:${port}`;
  const args = ['--port', String(port), '--chain-id', String(ANVIL_CHAIN_ID), '--silent', ...(opts.statePath ? ['--state', opts.statePath] : [])];
  const child = spawn(anvil, args, { stdio: 'ignore', env: foundryEnv() });
  let gone = false;
  child.once('exit', () => (gone = true));
  child.once('error', () => (gone = true));
  const stop = async () => {
    if (gone || child.pid === undefined) return;
    process.kill(child.pid, 'SIGTERM');
    const killer = setTimeout(() => {
      if (!gone && child.pid !== undefined) process.kill(child.pid, 'SIGKILL');
    }, 5_000);
    await exited(child);
    clearTimeout(killer);
  };
  const deadline = Date.now() + (opts.readyTimeoutMs ?? 20_000);
  for (;;) {
    if (gone) throw new Error(`anvil exited before its RPC answered on port ${port}`);
    try {
      const { stdout } = await execFileAsync(cast, ['chain-id', '--rpc-url', rpcUrl], { timeout: 3_000, env: foundryEnv() });
      if (stdout.trim() === String(ANVIL_CHAIN_ID)) break;
    } catch {
      // not ready yet
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`anvil did not answer on port ${port} within ${opts.readyTimeoutMs ?? 20_000} ms`);
    }
    await delay(100);
  }
  return { rpcUrl, port, pid: child.pid!, stop };
}

/** `forge build` in contracts/ (compiles offline with the pinned solc; a no-op when nothing changed). */
export async function forgeBuild(contractsDir = CONTRACTS_DIR): Promise<void> {
  await execFileAsync(foundryBin('forge'), ['build'], { cwd: contractsDir, env: foundryEnv(), timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
}

/** What a local-Anvil top-up sends the operator. */
export const ANVIL_FUND_AMOUNT = parseEther('100');

/**
 * Top up the operator for a deploy, on local Anvil ONLY (chain id 31337 and a client that answers
 * web3_clientVersion with "anvil"): when its balance is below `minBalance`, Anvil's first unlocked dev
 * account sends it ANVIL_FUND_AMOUNT by eth_sendTransaction, so no dev private key appears anywhere. On
 * any other chain an underfunded operator is an error naming its address. True when it sent funds.
 * Shared by the BatchRegistry and escrow deploys (final branch review finding 5).
 */
export async function fundOperatorOnLocalAnvil(
  pub: PublicClient,
  transport: Transport,
  operator: Address,
  o: { chainId: number; minBalance: bigint },
): Promise<boolean> {
  if ((await pub.getBalance({ address: operator })) >= o.minBalance) return false;
  const version = o.chainId === ANVIL_CHAIN_ID ? ((await pub.request({ method: 'web3_clientVersion' } as never)) as unknown) : '';
  if (typeof version !== 'string' || !version.toLowerCase().startsWith('anvil')) {
    throw new Error(`EVM operator ${operator} has no funds on chain ${o.chainId}; fund it, then deploy again`);
  }
  const [dev] = (await pub.request({ method: 'eth_accounts' } as never)) as Address[];
  if (!dev) throw new Error('local Anvil exposes no unlocked dev account to fund the operator');
  const hash = await createWalletClient({ account: dev, transport }).sendTransaction({ account: dev, to: operator, value: ANVIL_FUND_AMOUNT, chain: null });
  await pub.waitForTransactionReceipt({ hash });
  return true;
}

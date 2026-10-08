import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { deployRegistry } from './deploy';
import { readDeployment } from './deployment';
import { readOperatorKey } from './operator-key';

// TSK-24.3: `pnpm contracts:deploy` deploys BatchRegistry with a generated operator key (0600), funded
// from Anvil's dev account, writes DATA_DIR/evm/deployment.json, and is a no-op when run again.

const ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const execFileAsync = promisify(execFile);
const rpcUrl = inject('anvilRpcUrl');

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udgam-evm-deploy-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('deployRegistry', () => {
  it('generates a 0600 operator key, deploys, writes deployment.json; a second run is a no-op', async () => {
    const deploymentPath = join(dir, 'a', 'evm', 'deployment.json');
    const operatorKeyPath = join(dir, 'a', 'keys', 'evm-operator.key');
    const first = await deployRegistry({ rpcUrl, deploymentPath, operatorKeyPath });
    expect(first.created).toBe(true);

    const key = await readOperatorKey(operatorKeyPath);
    expect((await stat(operatorKeyPath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'a', 'keys'))).mode & 0o777).toBe(0o700);
    const operator = privateKeyToAccount(key).address;

    const onDisk = await readDeployment(deploymentPath);
    expect(onDisk).toEqual(first.deployment);
    expect(onDisk).toMatchObject({ chainId: 31337, operator, confirmations: 1 });
    expect(Object.keys(onDisk).sort()).toEqual(['chainId', 'confirmations', 'deployedAtBlock', 'operator', 'registry']);
    const pub = createPublicClient({ transport: http(rpcUrl) });
    expect(await pub.getCode({ address: onDisk.registry })).toMatch(/^0x[0-9a-f]{10,}/);
    expect(await pub.getCode({ address: onDisk.registry, blockNumber: BigInt(onDisk.deployedAtBlock - 1) })).toBeUndefined();

    const second = await deployRegistry({ rpcUrl, deploymentPath, operatorKeyPath });
    expect(second).toEqual({ deployment: first.deployment, created: false });
    expect(await readOperatorKey(operatorKeyPath)).toBe(key);
  });

  it('refuses to overwrite a deployment.json whose registry is not on this chain', async () => {
    const deploymentPath = join(dir, 'b', 'evm', 'deployment.json');
    const operatorKeyPath = join(dir, 'b', 'keys', 'evm-operator.key');
    await deployRegistry({ rpcUrl, deploymentPath, operatorKeyPath });
    const d = JSON.parse(await readFile(deploymentPath, 'utf8')) as Record<string, unknown>;
    await writeFile(deploymentPath, JSON.stringify({ ...d, registry: '0x000000000000000000000000000000000000dEaD' }));
    await expect(deployRegistry({ rpcUrl, deploymentPath, operatorKeyPath })).rejects.toThrow(/not live on this RPC/);
  });

  it('pnpm contracts:deploy (scripts/evm-deploy.ts) prints did: then ok:, never the key', async () => {
    const dataDir = join(dir, 'c');
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATA_DIR: dataDir, ANVIL_RPC_URL: rpcUrl, LOG_LEVEL: 'silent' } as unknown as NodeJS.ProcessEnv;
    const run = () => execFileAsync(TSX, ['scripts/evm-deploy.ts'], { cwd: ROOT, env, timeout: 120_000 });
    const a = await run();
    expect(a.stdout).toMatch(/^did: BatchRegistry deployed at 0x[0-9a-fA-F]{40} on chain 31337/);
    const b = await run();
    expect(b.stdout).toMatch(/^ok: BatchRegistry already deployed/);
    const key = await readOperatorKey(join(dataDir, 'keys', 'evm-operator.key'));
    expect(a.stdout + a.stderr + b.stdout + b.stderr).not.toContain(key.slice(2));
  });
});

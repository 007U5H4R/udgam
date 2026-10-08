import { createPublicClient, custom, parseEther } from 'viem';
import { describe, expect, it } from 'vitest';
import { FoundryMissing, foundryBin, foundryEnv, fundOperatorOnLocalAnvil } from './foundry';

// TSK-24.4: without the pinned Foundry the EVM tooling (and so the `evm` vitest project's global setup)
// FAILS naming the fix; it never skips. Children get HOME only, never the parent's variables.
describe('foundry tooling', () => {
  it('a missing binary is an error that names cloud-setup.sh and the pinned version', () => {
    expect(() => foundryBin('anvil', '/nonexistent-udgam-home')).toThrow(FoundryMissing);
    expect(() => foundryBin('anvil', '/nonexistent-udgam-home')).toThrow(/scripts\/cloud-setup\.sh.*1\.8\.3/);
  });

  it('child processes get a minimal environment', () => {
    expect(Object.keys(foundryEnv()).sort()).toEqual(['HOME']);
    expect(Object.keys(foundryEnv({ FOUNDRY_BROADCAST: '/tmp/x' })).sort()).toEqual(['FOUNDRY_BROADCAST', 'HOME']);
  });
});

// Final branch review finding 5 (TASK-25): the "local Anvil only" operator funding is one routine, shared
// by the BatchRegistry and escrow deploys. Exercised against a scripted JSON-RPC transport.
describe('fundOperatorOnLocalAnvil', () => {
  const OPERATOR = '0x1111111111111111111111111111111111111111' as const;
  const DEV = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as const;
  const HASH = `0x${'ab'.repeat(32)}` as const;

  function rpc(answers: { balance: bigint; version?: string; accounts?: string[] }) {
    const calls: { method: string; params: unknown }[] = [];
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        calls.push({ method, params });
        switch (method) {
          case 'eth_getBalance':
            return `0x${answers.balance.toString(16)}`;
          case 'web3_clientVersion':
            return answers.version ?? 'anvil/v1.8.3';
          case 'eth_accounts':
            return answers.accounts ?? [DEV];
          case 'eth_chainId':
            return '0x7a69';
          case 'eth_sendTransaction':
            return HASH;
          case 'eth_blockNumber':
            return '0x2';
          case 'eth_getTransactionReceipt':
            return {
              transactionHash: HASH,
              blockNumber: '0x2',
              blockHash: `0x${'cd'.repeat(32)}`,
              status: '0x1',
              logs: [],
              cumulativeGasUsed: '0x5208',
              gasUsed: '0x5208',
              effectiveGasPrice: '0x1',
              from: DEV,
              to: OPERATOR,
              transactionIndex: '0x0',
              type: '0x2',
              contractAddress: null,
              logsBloom: `0x${'00'.repeat(256)}`,
            };
          default:
            throw new Error(`unscripted RPC ${method}`);
        }
      },
    });
    return { transport, pub: createPublicClient({ transport, pollingInterval: 10 }), calls };
  }
  const methods = (calls: { method: string }[]) => calls.map((c) => c.method);

  it('does nothing when the operator already holds the minimum', async () => {
    const r = rpc({ balance: parseEther('5') });
    expect(await fundOperatorOnLocalAnvil(r.pub, r.transport, OPERATOR, { chainId: 31337, minBalance: parseEther('5') })).toBe(false);
    expect(methods(r.calls)).toEqual(['eth_getBalance']);
  });

  it('on local Anvil, sends 100 ETH from the first unlocked dev account and waits for it', async () => {
    const r = rpc({ balance: BigInt(0) });
    expect(await fundOperatorOnLocalAnvil(r.pub, r.transport, OPERATOR, { chainId: 31337, minBalance: parseEther('1') })).toBe(true);
    const send = r.calls.find((c) => c.method === 'eth_sendTransaction');
    expect(send?.params).toEqual([expect.objectContaining({ from: DEV, to: OPERATOR, value: '0x56bc75e2d63100000' })]);
    expect(methods(r.calls)).toContain('eth_getTransactionReceipt');
  });

  it('refuses to fund on any chain other than 31337, naming the operator, without asking the client', async () => {
    const r = rpc({ balance: BigInt(0) });
    await expect(fundOperatorOnLocalAnvil(r.pub, r.transport, OPERATOR, { chainId: 1, minBalance: parseEther('1') })).rejects.toThrow(
      `EVM operator ${OPERATOR} has no funds on chain 1; fund it, then deploy again`,
    );
    expect(methods(r.calls)).toEqual(['eth_getBalance']);
  });

  it('refuses on chain 31337 when the client is not Anvil', async () => {
    const r = rpc({ balance: BigInt(0), version: 'Geth/v1.14.0' });
    await expect(fundOperatorOnLocalAnvil(r.pub, r.transport, OPERATOR, { chainId: 31337, minBalance: parseEther('1') })).rejects.toThrow(/has no funds on chain 31337/);
    expect(methods(r.calls)).not.toContain('eth_sendTransaction');
  });

  it('refuses when Anvil exposes no unlocked dev account', async () => {
    const r = rpc({ balance: BigInt(0), accounts: [] });
    await expect(fundOperatorOnLocalAnvil(r.pub, r.transport, OPERATOR, { chainId: 31337, minBalance: parseEther('1') })).rejects.toThrow(
      'local Anvil exposes no unlocked dev account to fund the operator',
    );
  });
});

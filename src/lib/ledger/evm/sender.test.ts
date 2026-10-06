import { BaseError, NonceTooLowError, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import { evmAccount, exclusive, isNonceCollision, processNonceManager, receiptOf, sendFrom } from './sender';

// Stage 10 SEC-200: sends from one EVM account are serialised per account and chain in this process, and a
// nonce collision (another sender took the nonce first) resyncs the nonce and retries once. The Anvil
// proof is src/lib/agreements/concurrent-sends.evm.test.ts.

const A = '0x00000000000000000000000000000000000000aa' as const;
const B = '0x00000000000000000000000000000000000000bb' as const;
const CHAIN = 31337;
const tick = () => new Promise((r) => setTimeout(r, 5));
/** viem's shape for the node's "nonce too low" answer to eth_sendRawTransaction. */
const nonceTooLow = (details: string) => new TransactionExecutionError(new NonceTooLowError({ cause: new BaseError('rpc', { details }) }), { account: null });

describe('isNonceCollision', () => {
  it("names the node answers that mean another transaction took this nonce", () => {
    expect(isNonceCollision(nonceTooLow('transaction already imported'))).toBe(true);
    expect(isNonceCollision(nonceTooLow('nonce too low'))).toBe(true);
    expect(isNonceCollision(new BaseError('Transaction creation failed.', { details: 'already known' }))).toBe(true);
    expect(isNonceCollision(new BaseError('An error occurred.', { details: 'replacement transaction underpriced' }))).toBe(true);
  });

  it('is false for a revert, a dead RPC, or anything that is not a viem error', () => {
    expect(isNonceCollision(new BaseError('Execution reverted.', { details: 'execution reverted: NotOperator' }))).toBe(false);
    expect(isNonceCollision(new BaseError('HTTP request failed.', { details: 'fetch failed' }))).toBe(false);
    expect(isNonceCollision(new Error('nonce too low'))).toBe(false);
    expect(isNonceCollision(undefined)).toBe(false);
  });
});

describe('sendFrom', () => {
  it('runs sends from one account one at a time, in call order; other accounts are not held up', async () => {
    const order: string[] = [];
    let inA = 0;
    let maxInA = 0;
    const slowA = (name: string) => async () => {
      inA++;
      maxInA = Math.max(maxInA, inA);
      order.push(`${name}:start`);
      await tick();
      order.push(`${name}:end`);
      inA--;
      return name;
    };
    const b = sendFrom(B, CHAIN, async () => {
      order.push('b');
      return 'b';
    });
    const out = await Promise.all([sendFrom(A, CHAIN, slowA('a1')), sendFrom(A, CHAIN, slowA('a2')), sendFrom(A, CHAIN, slowA('a3')), b]);
    expect(out).toEqual(['a1', 'a2', 'a3', 'b']);
    expect(maxInA).toBe(1);
    expect(order.filter((x) => x.startsWith('a'))).toEqual(['a1:start', 'a1:end', 'a2:start', 'a2:end', 'a3:start', 'a3:end']);
    // B ran while a1 was still in flight
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a1:end'));
  });

  it('the same address on another chain is a separate queue; address case does not matter', async () => {
    let inFlight = 0;
    let max = 0;
    const s = async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await tick();
      inFlight--;
    };
    await Promise.all([sendFrom(A, CHAIN, s), sendFrom(A.toUpperCase().replace('0X', '0x') as typeof A, CHAIN, s)]);
    expect(max).toBe(1);
    await Promise.all([sendFrom(A, CHAIN, s), sendFrom(A, 1, s)]);
    expect(max).toBe(2);
  });

  it('a nonce collision resets the nonce manager for that account and retries once', async () => {
    const reset = vi.spyOn(processNonceManager(), 'reset');
    let calls = 0;
    const out = await sendFrom(A, CHAIN, async () => {
      if (++calls === 1) throw nonceTooLow('transaction already imported');
      return 'mined';
    });
    expect(out).toBe('mined');
    expect(calls).toBe(2);
    expect(reset).toHaveBeenCalledWith({ address: A, chainId: CHAIN });
    reset.mockRestore();
  });

  it('only once: a second collision is the caller’s error', async () => {
    let calls = 0;
    const e = nonceTooLow('nonce too low');
    await expect(
      sendFrom(A, CHAIN, async () => {
        calls++;
        throw e;
      }),
    ).rejects.toBe(e);
    expect(calls).toBe(2);
  });

  it('any other error is not retried, and does not block the next send', async () => {
    let calls = 0;
    const revert = new BaseError('Execution reverted.', { details: 'execution reverted' });
    await expect(
      sendFrom(A, CHAIN, async () => {
        calls++;
        throw revert;
      }),
    ).rejects.toBe(revert);
    expect(calls).toBe(1);
    await expect(sendFrom(A, CHAIN, async () => 'next')).resolves.toBe('next');
  });
});

describe('exclusive', () => {
  it('holds the account across several sends (approve then fund); sends inside it do not wait on themselves', async () => {
    const order: string[] = [];
    const first = exclusive(A, CHAIN, async () => {
      await sendFrom(A, CHAIN, async () => {
        order.push('approve-1');
        await tick();
      });
      await sendFrom(A, CHAIN, async () => {
        order.push('fund-1');
      });
    });
    const second = exclusive(A, CHAIN, async () => {
      await sendFrom(A, CHAIN, async () => {
        order.push('approve-2');
      });
      await sendFrom(A, CHAIN, async () => {
        order.push('fund-2');
      });
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['approve-1', 'fund-1', 'approve-2', 'fund-2']);
  });
});

describe('receiptOf', () => {
  it('passes a receipt through; a failed wait forgets the remembered nonce (a dropped tx leaves no gap) and rethrows', async () => {
    const reset = vi.spyOn(processNonceManager(), 'reset');
    await expect(receiptOf(A, CHAIN, async () => 'receipt')).resolves.toBe('receipt');
    expect(reset).not.toHaveBeenCalled();
    const timeout = new Error('Timed out while waiting for transaction');
    await expect(receiptOf(A, CHAIN, () => Promise.reject(timeout))).rejects.toBe(timeout);
    expect(reset).toHaveBeenCalledWith({ address: A, chainId: CHAIN });
    reset.mockRestore();
  });
});

describe('evmAccount', () => {
  it("signs with the process nonce manager, so every client of one key shares one nonce sequence", () => {
    const key = generatePrivateKey();
    const one = evmAccount(key);
    const two = evmAccount(key);
    expect(one.address).toBe(two.address);
    expect(one.nonceManager).toBe(processNonceManager());
    expect(two.nonceManager).toBe(processNonceManager());
  });
});

import { keccak256, toHex, type Address, type Hex } from 'viem';
import { ChainError, type ChainTx, type CreateTerms, type EscrowChain, type OnChainStatus, type SettleArgs, type SettleOutcome } from '../chain';

// An in-memory ContractFarming for service tests (TEST-ONLY; never imported by the app). It follows the
// contract's rules that the services rely on: the status machine, the deadline windows, one release per
// batch across agreements, the three-condition bitmask, and the events the lost-receipt recovery reads.
// Like a real chain, a call is checked when it is sent and again when it is mined, with a tick between,
// so two concurrent calls can both pass the first check and the second is turned away when mined.
// It does not check grade signatures (the evm tests do).

type Row = { status: OnChainStatus; agreedGrams: bigint; minGrade: number; amount: bigint; deadline: bigint };
type Event = { name: 'AgreementCreated' | 'Funded' | 'Refunded' | 'Settled' | 'SettlementRejected'; id: Hex; batchIdHash?: Hex; tx: ChainTx };

export type FakeChain = EscrowChain & {
  /** Calls that reached the chain (sent), per method. */
  sends: Record<'createAgreement' | 'fund' | 'refund' | 'settle', number>;
  events: Event[];
  batchReleased: Set<Hex>;
  /** Clock the deadline checks use (unix seconds). */
  nowSeconds: () => bigint;
};

const tick = () => new Promise<void>((r) => setImmediate(r));

export function createFakeChain(o: { nowSeconds?: () => bigint } = {}): FakeChain {
  const rows = new Map<Hex, Row>();
  const events: Event[] = [];
  const batchReleased = new Set<Hex>();
  const sends = { createAgreement: 0, fund: 0, refund: 0, settle: 0 };
  let block = 100;
  const nowSeconds = o.nowSeconds ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const mine = (name: Event['name'], id: Hex, batchIdHash?: Hex): ChainTx => {
    block += 1;
    const tx = { txHash: keccak256(toHex(`${name}:${id}:${block}`)), blockNumber: block };
    events.push({ name, id, batchIdHash, tx });
    return tx;
  };
  const wrong = () => new ChainError('turned_away', 'WrongStatus');
  const earlier = (name: Event['name'], id: Hex, batch?: Hex): ChainTx | null =>
    events.filter((e) => e.name === name && e.id === id && (batch === undefined || e.batchIdHash === batch)).at(-1)?.tx ?? null;
  const status = (id: Hex): OnChainStatus => rows.get(id)?.status ?? 'none';

  return {
    chainId: 31337,
    escrow: '0x00000000000000000000000000000000000fa4e1' as Address,
    token: '0x00000000000000000000000000000000000fa4e2' as Address,
    sends,
    events,
    batchReleased,
    nowSeconds,
    gradeDomain: () => ({ chainId: 31337, contract: '0x00000000000000000000000000000000000fa4e1' as Address }),
    status: async (id) => status(id),
    balanceOf: async () => BigInt(0),
    ensureBuyer: async () => undefined,

    async createAgreement(t: CreateTerms) {
      // as chain.ts: an agreement already on chain is recovered from its event
      if (status(t.id) !== 'none') {
        const tx = earlier('AgreementCreated', t.id);
        if (tx) return tx;
      }
      sends.createAgreement += 1;
      await tick();
      if (status(t.id) !== 'none') throw wrong();
      rows.set(t.id, { status: 'created', agreedGrams: t.agreedGrams, minGrade: t.minGrade, amount: t.amountPaise, deadline: t.deadline });
      return mine('AgreementCreated', t.id);
    },

    async fund(_org, id) {
      if (status(id) === 'funded') {
        const tx = earlier('Funded', id);
        if (tx) return tx;
      }
      if (status(id) !== 'created') throw wrong();
      sends.fund += 1;
      await tick();
      const r = rows.get(id)!;
      if (r.status !== 'created') throw wrong();
      if (nowSeconds() > r.deadline) throw new ChainError('turned_away', 'DeadlinePassed');
      r.status = 'funded';
      return mine('Funded', id);
    },

    async refund(_org, id) {
      if (status(id) === 'refunded') {
        const tx = earlier('Refunded', id);
        if (tx) return tx;
      }
      if (status(id) !== 'funded') throw wrong();
      sends.refund += 1;
      await tick();
      const r = rows.get(id)!;
      if (r.status !== 'funded') throw wrong();
      if (nowSeconds() <= r.deadline) throw new ChainError('turned_away', 'DeadlineNotPassed');
      r.status = 'refunded';
      return mine('Refunded', id);
    },

    async settle(a: SettleArgs): Promise<SettleOutcome> {
      const check = () => {
        const r = rows.get(a.id);
        if (!r || r.status !== 'funded') throw wrong();
        if (nowSeconds() > r.deadline) throw new ChainError('turned_away', 'DeadlinePassed');
        if (batchReleased.has(a.batchIdHash)) throw new ChainError('turned_away', 'BatchAlreadyReleased');
        return r;
      };
      check(); // simulate
      sends.settle += 1;
      await tick();
      const r = check(); // mined
      const reasons = (a.deliveredGrams < r.agreedGrams ? 1 : 0) | (a.grade < r.minGrade ? 2 : 0) | (a.allVerified ? 0 : 4);
      if (reasons !== 0) return { ...mine('SettlementRejected', a.id, a.batchIdHash), released: false, reasons };
      r.status = 'settled';
      batchReleased.add(a.batchIdHash);
      return { ...mine('Settled', a.id, a.batchIdHash), released: true, reasons: 0 };
    },

    settledTx: async (id, batchIdHash) => earlier('Settled', id, batchIdHash),
  };
}

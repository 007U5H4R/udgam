import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { EMAIL_FAILURES, IP_FAILURES, PAIR_FAILURES, refundSignIn, reserveSignIn } from './sign-in-limit';

// TKT-19 carry-forward, fix round 1: every sign-in attempt reserves a slot atomically before Better Auth
// sees it (so a parallel burst can't pass a read-only check together), a success gives it back, and the
// limits are per (email, address) 10, per email 50 and per address 30 in 15 minutes. One address can't
// lock the owner out: its refused attempts count against nothing.
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const T0 = new Date('2026-10-14T04:00:00.000Z'); // a 15-minute window boundary
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

/** A failed attempt: reserved and kept. */
const fail = async (email: string, ip: string, now: Date) => (await reserveSignIn(t.db, email, ip, now)).ok;

describe('sign-in attempt limits', () => {
  it('the limits: 10 per (email, address), 50 per email, 30 per address, each per 15 minutes', () => {
    expect(PAIR_FAILURES).toEqual({ limit: 10, windowSec: 900 });
    expect(EMAIL_FAILURES).toEqual({ limit: 50, windowSec: 900 });
    expect(IP_FAILURES).toEqual({ limit: 30, windowSec: 900 });
  });

  it('10 failures for one email from one address block that pair; the owner at another address still signs in', async () => {
    for (let i = 0; i < 10; i++) expect(await fail('agent@a.test', '203.0.113.7', at(i))).toBe(true);
    expect((await reserveSignIn(t.db, 'Agent@A.test ', '203.0.113.7', at(11))).ok).toBe(false); // same email, other case and spacing
    // the attacker keeps going: refused attempts count against nothing
    for (let i = 0; i < 100; i++) expect(await fail('agent@a.test', '203.0.113.7', at(12))).toBe(false);
    expect((await reserveSignIn(t.db, 'agent@a.test', '198.51.100.20', at(13))).ok).toBe(true); // the owner, elsewhere
    expect((await reserveSignIn(t.db, 'other@a.test', '203.0.113.7', at(13))).ok).toBe(true); // another email, same address
    expect((await reserveSignIn(t.db, 'agent@a.test', '203.0.113.7', at(900))).ok).toBe(true); // next window
  });

  it('50 failures for one email across addresses block that email everywhere', async () => {
    for (let i = 0; i < 50; i++) expect(await fail('agent@a.test', `198.51.100.${i}`, at(i))).toBe(true);
    expect((await reserveSignIn(t.db, 'agent@a.test', '198.51.100.200', at(60))).ok).toBe(false);
    expect((await reserveSignIn(t.db, 'other@a.test', '198.51.100.200', at(60))).ok).toBe(true);
  });

  it('30 failures from one address (any emails) block that address', async () => {
    for (let i = 0; i < 30; i++) expect(await fail(`user${i}@a.test`, '203.0.113.7', at(i))).toBe(true);
    expect((await reserveSignIn(t.db, 'fresh@a.test', '203.0.113.7', at(40))).ok).toBe(false);
    expect((await reserveSignIn(t.db, 'fresh@a.test', '203.0.113.8', at(40))).ok).toBe(true);
  });

  it('a refunded attempt (a success) counts against nothing', async () => {
    for (let i = 0; i < 100; i++) {
      const r = await reserveSignIn(t.db, 'agent@a.test', '203.0.113.7', at(1));
      expect(r.ok, `attempt ${i}`).toBe(true);
      await refundSignIn(t.db, r);
    }
    const counts = (await t.client.execute('SELECT count FROM rate_limits')).rows.map((r) => Number(r.count));
    expect(counts).toEqual([0, 0, 0]);
  });

  it('20 parallel reservations for one email and address: exactly 10 go through', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveSignIn(t.db, 'agent@a.test', '203.0.113.7', at(5))));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
  });

  it('re-running the account seed clears the demo accounts’ failure counts, as a password reset would', async () => {
    const { DEMO_ACCOUNTS, seedAccounts } = await import('../../../scripts/seed-accounts');
    const now = new Date();
    for (let i = 0; i < 10; i++) await reserveSignIn(t.db, DEMO_ACCOUNTS.adminA.email, 'unknown', now);
    for (let i = 0; i < 40; i++) await reserveSignIn(t.db, DEMO_ACCOUNTS.adminA.email, `198.51.100.${i}`, now);
    expect((await reserveSignIn(t.db, DEMO_ACCOUNTS.adminA.email, 'unknown', now)).ok).toBe(false);
    await seedAccounts(t.db, 'a seed password for tests');
    expect((await reserveSignIn(t.db, DEMO_ACCOUNTS.adminA.email, 'unknown', now)).ok).toBe(true);
  });

  it('stores no email in rate_limits', async () => {
    await reserveSignIn(t.db, 'agent@a.test', '203.0.113.7', at(1));
    const keys = (await t.client.execute('SELECT key FROM rate_limits')).rows.map((r) => String(r.key));
    expect(keys).toHaveLength(3);
    expect(keys.join()).not.toContain('agent@a.test');
  });
});

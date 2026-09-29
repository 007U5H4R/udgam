import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { EMAIL_FAILURES, IP_FAILURES, recordSignInFailure, signInBlocked } from './sign-in-limit';

// TKT-19 carry-forward: the sign-in Server Action is throttled on failed attempts through rate_limits.
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const T0 = new Date('2026-10-14T04:00:00.000Z'); // a 15-minute window boundary
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

describe('sign-in failure limits', () => {
  it('10 failures for one email (from any address) block that email for the rest of the window', async () => {
    expect(EMAIL_FAILURES).toEqual({ limit: 10, windowSec: 900 });
    for (let i = 0; i < 9; i++) await recordSignInFailure(t.db, 'agent@a.test', `198.51.100.${i}`, at(i));
    expect(await signInBlocked(t.db, 'agent@a.test', '198.51.100.99', at(10))).toBe(false);
    await recordSignInFailure(t.db, 'Agent@A.test ', '198.51.100.50', at(11)); // same email, other case and spacing
    expect(await signInBlocked(t.db, 'agent@a.test', '198.51.100.99', at(12))).toBe(true);
    expect(await signInBlocked(t.db, 'other@a.test', '198.51.100.99', at(12))).toBe(false);
    expect(await signInBlocked(t.db, 'agent@a.test', '198.51.100.99', at(900))).toBe(false); // next window
  });

  it('30 failures from one address (any emails) block that address', async () => {
    expect(IP_FAILURES).toEqual({ limit: 30, windowSec: 900 });
    for (let i = 0; i < 30; i++) await recordSignInFailure(t.db, `user${i}@a.test`, '203.0.113.7', at(i));
    expect(await signInBlocked(t.db, 'fresh@a.test', '203.0.113.7', at(40))).toBe(true);
    expect(await signInBlocked(t.db, 'fresh@a.test', '203.0.113.8', at(40))).toBe(false);
  });

  it('re-running the account seed clears the demo accounts’ failure counts, as a password reset would', async () => {
    const { DEMO_ACCOUNTS, seedAccounts } = await import('../../../scripts/seed-accounts');
    const now = new Date();
    for (let i = 0; i < 10; i++) await recordSignInFailure(t.db, DEMO_ACCOUNTS.adminA.email, `198.51.100.${i}`, now);
    expect(await signInBlocked(t.db, DEMO_ACCOUNTS.adminA.email, '198.51.100.99', now)).toBe(true);
    await seedAccounts(t.db, 'a seed password for tests');
    expect(await signInBlocked(t.db, DEMO_ACCOUNTS.adminA.email, '198.51.100.99', now)).toBe(false);
  });

  it('stores no email in rate_limits', async () => {
    await recordSignInFailure(t.db, 'agent@a.test', '203.0.113.7', at(1));
    const keys = (await t.client.execute('SELECT key FROM rate_limits')).rows.map((r) => String(r.key));
    expect(keys).toHaveLength(2);
    expect(keys.join()).not.toContain('agent@a.test');
  });
});

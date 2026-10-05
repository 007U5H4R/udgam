// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import { outcome } from '../../../../../tests/helpers/next';
import type { Role } from '../../../../lib/auth/session';
import { writeTx } from '../../../../lib/db/client';
import { agreements, ledgerEntries } from '../../../../lib/db/schema';
import { append } from '../../../../lib/ledger/hashchain';

// TSK-25.7: the agreement Server Actions' role/org guard matrix (technical-plan §10, TC-018 pattern,
// EVAL-080). Buyer actions: 401 signed out, 403 for an agent or an admin; the admin's settle: 403 for a
// buyer. Another organisation's agreement is a 404 exactly like an unknown id. A field check returns
// the §28.7 message with every value kept; a ledger that does not answer moves and records nothing.

const request = vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
  return { headers: new Headers() };
});
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let t: TempDb;
const PASSWORD = 'agreements action password';
type Who = Role | 'buyerB' | 'adminB';
const cookies: Partial<Record<Who, string>> = {};

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  // no escrow deployment in DATA_DIR and a closed port: the ledger never answers in this file
  vi.stubEnv('ANVIL_RPC_URL', 'http://127.0.0.1:9');
  await addOrg(t.db, 'ORG-FPO', 'fpo');
  await addOrg(t.db, 'ORG-FPO2', 'fpo');
  await addOrg(t.db, 'ORG-BUY', 'buyer');
  await addOrg(t.db, 'ORG-BUY2', 'buyer');
  const { appAuth } = await import('../../../_auth/auth');
  const users = [
    ['agent', 'agent', 'ORG-FPO'],
    ['admin', 'admin', 'ORG-FPO'],
    ['adminB', 'admin', 'ORG-FPO2'],
    ['buyer', 'buyer', 'ORG-BUY'],
    ['buyerB', 'buyer', 'ORG-BUY2'],
  ] as const;
  for (const [key, role, orgId] of users) {
    await addUser(t.db, { id: `U-${key}`, email: `${key.toLowerCase()}@agr.test`, password: PASSWORD, role, orgId });
    cookies[key] = cookieHeader(await appAuth().api.signInEmail({ body: { email: `${key.toLowerCase()}@agr.test`, password: PASSWORD }, asResponse: true }));
  }
  const seq = (await writeTx(t.db, (tx) => append(tx, 'agreement_created', { v: 1, agreementId: 'AG-TESTAAAA' }))).seq;
  await writeTx(t.db, (tx) =>
    tx
      .insert(agreements)
      .values({
        id: 'AG-TESTAAAA',
        chainIdHex: '0x01',
        buyerOrg: 'ORG-BUY',
        fpoOrg: 'ORG-FPO',
        crop: 'arabica',
        agreedKg: 600,
        minGrade: 70,
        amountPaise: 15_000_000,
        deadline: '2099-12-31T18:29:59.999Z',
        createdBy: 'U-buyer',
        createdAt: '2026-10-01T00:00:00.000Z',
        createdTxHash: '0x02',
        anchorSeq: seq,
      })
      .then(() => undefined),
  );
}, 40_000);
afterEach(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  request.headers = new Headers();
  await t.cleanup();
});

const as = (who: Who | null) => {
  request.headers = new Headers(who ? { cookie: cookies[who]! } : {});
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const buyerActions = () => import('./actions');
const adminActions = () => import('../../../(admin)/admin/agreements/actions');
const ledgerCount = () => t.db.$count(ledgerEntries);

describe('agreement actions: guards (TSK-25.7)', () => {
  it('buyer actions: 401 signed out, 403 for an agent or an FPO admin, nothing written', async () => {
    const a = await buyerActions();
    const before = await ledgerCount();
    for (const who of [null, 'agent', 'admin'] as const) {
      as(who);
      const status = who ? 403 : 401;
      const f = form({ agreementId: 'AG-TESTAAAA', batchId: 'B-X', grade: '80' });
      await expect(a.createAgreementAction({}, f)).rejects.toMatchObject({ status });
      await expect(a.fundAgreementAction({}, f)).rejects.toMatchObject({ status });
      await expect(a.refundAgreementAction({}, f)).rejects.toMatchObject({ status });
      await expect(a.gradeBatchAction({}, f)).rejects.toMatchObject({ status });
    }
    expect(await ledgerCount()).toBe(before);
  });

  it("the admin's settle: 401 signed out, 403 for a buyer or an agent", async () => {
    const a = await adminActions();
    for (const who of [null, 'buyer', 'agent'] as const) {
      as(who);
      await expect(a.settleAgreementAction({}, form({ agreementId: 'AG-TESTAAAA', batchId: 'B-X' }))).rejects.toMatchObject({ status: who ? 403 : 401 });
    }
  });

  it("another organisation's agreement is a 404, exactly like an unknown id (EVAL-080)", async () => {
    as('buyerB');
    const a = await buyerActions();
    for (const id of ['AG-TESTAAAA', 'AG-NOSUCH00']) {
      expect(await outcome(() => a.fundAgreementAction({}, form({ agreementId: id })))).toEqual({ notFound: true });
      expect(await outcome(() => a.refundAgreementAction({}, form({ agreementId: id })))).toEqual({ notFound: true });
      expect(await outcome(() => a.gradeBatchAction({}, form({ agreementId: id, batchId: 'B-X', grade: '80' })))).toEqual({ notFound: true });
    }
    as('adminB');
    const s = await adminActions();
    for (const id of ['AG-TESTAAAA', 'AG-NOSUCH00']) {
      expect(await outcome(() => s.settleAgreementAction({}, form({ agreementId: id, batchId: 'B-X' })))).toEqual({ notFound: true });
    }
  });
});

describe('agreement actions: states (Design.md §28.6–§28.7)', () => {
  it('a field check returns the messages and keeps every value as typed', async () => {
    as('buyer');
    const a = await buyerActions();
    const typed = { fpo: 'ORG-FPO', crop: 'arabica', kg: '', minGrade: '', amount: '1,50,000.505', deadline: '2020-01-01' };
    const state = await a.createAgreementAction({}, form(typed));
    expect(state).toEqual({
      fieldErrors: {
        kg: 'Enter the agreed quantity in kg, for example 600.0.',
        minGrade: 'Choose the lowest grade you accept.',
        amount: 'Paise take two digits at most, for example 150000.50.',
        deadline: 'Choose a date after today.',
      },
      values: typed,
    });
    const g = await a.gradeBatchAction({}, form({ agreementId: 'AG-TESTAAAA', batchId: 'B-X', grade: '255' }));
    expect(g.fieldErrors).toEqual({ grade: 'Choose one of the five grades.' });
  });

  it('when the ledger does not answer, funding says so and nothing moves or is recorded', async () => {
    as('buyer');
    const a = await buyerActions();
    const before = await ledgerCount();
    expect(await a.fundAgreementAction({}, form({ agreementId: 'AG-TESTAAAA' }))).toEqual({ failure: 'no_answer' });
    expect(await ledgerCount()).toBe(before);
    const [row] = await t.db.select().from(agreements).where(eq(agreements.id, 'AG-TESTAAAA'));
    expect(row!.status).toBe('created');
    const typed = { fpo: 'ORG-FPO', crop: 'arabica', kg: '600.0', minGrade: '70', amount: '150000', deadline: '2099-12-31' };
    expect(await a.createAgreementAction({}, form(typed))).toEqual({ failure: 'no_answer', values: typed });
    expect(await t.db.$count(agreements)).toBe(1);
  });
});

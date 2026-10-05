// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { seedProcessingWorld, type ProcessingWorld } from '../../../../tests/helpers/processing-world';
import { ledgerEntries, processingSteps } from '../../../lib/db/schema';

// TSK-26.4 through the Server Actions (TC-086, TC-018, EVAL-080): guarded (401 signed out, 403 for every
// other role), org-scoped from the session (a processor that was never handed the batch gets not_found),
// fields re-checked on the server with the §28.7 words, and a flagged step recorded, never refused.

const request = vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
  return { headers: new Headers() };
});
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let t: TempDb;
let w: ProcessingWorld;
let other: ProcessingWorld;
const PASSWORD = 'processor action password';
const cookies: Record<string, string> = {};

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  w = await seedProcessingWorld(t.db, { processorPassword: PASSWORD, adminPassword: PASSWORD });
  other = await seedProcessingWorld(t.db, { processorPassword: PASSWORD });
  await addOrg(t.db, 'ORG-BUYER-X', 'buyer');
  await addUser(t.db, { id: 'U-BUYER-X', email: 'buyer@x.test', password: PASSWORD, role: 'buyer', orgId: 'ORG-BUYER-X' });
  await addUser(t.db, { id: 'U-AGENT-X', email: 'agent@x.test', password: PASSWORD, role: 'agent', orgId: w.fpo.orgId });
  const { appAuth } = await import('../../_auth/auth');
  for (const [k, email] of [
    ['processor', w.processorEmail],
    ['otherProcessor', other.processorEmail],
    ['admin', w.fpo.adminEmail],
    ['buyer', 'buyer@x.test'],
    ['agent', 'agent@x.test'],
  ] as const) {
    cookies[k] = cookieHeader(await appAuth().api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true }));
  }
}, 60_000);
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  request.headers = new Headers();
  await t.cleanup();
});

const as = (who: string | null) => {
  request.headers = new Headers(who ? { cookie: cookies[who]! } : {});
};
const actions = () => import('./actions');
const STEP = () => ({ batchId: w.batchId, process: 'hulling_parchment', inputKg: '600.0', outputKg: '480.0' });

describe('processor actions', () => {
  it('are guarded: signed out → 401; agent, admin and buyer → 403; nothing written', async () => {
    const { recordStepAction, handOnAction } = await actions();
    const before = await t.db.$count(ledgerEntries);
    as(null);
    await expect(recordStepAction(STEP())).rejects.toMatchObject({ status: 401 });
    await expect(handOnAction({ batchId: w.batchId, toOrgId: w.buyerOrg })).rejects.toMatchObject({ status: 401 });
    for (const who of ['agent', 'admin', 'buyer']) {
      as(who);
      await expect(recordStepAction(STEP()), who).rejects.toMatchObject({ name: 'AuthError', status: 403 });
      await expect(handOnAction({ batchId: w.batchId, toOrgId: w.buyerOrg }), who).rejects.toMatchObject({ name: 'AuthError', status: 403 });
    }
    expect(await t.db.$count(ledgerEntries)).toBe(before);
  });

  it('records a flagged step (output above input) and hands on to a buyer', async () => {
    const { recordStepAction, handOnAction } = await actions();
    as('processor');
    const r = await recordStepAction({ ...STEP(), outputKg: '650.0' });
    expect(r).toMatchObject({ ok: true, status: 'flag', ratio: 108.3 });
    expect(await handOnAction({ batchId: w.batchId, toOrgId: w.buyerOrg })).toMatchObject({ ok: true });
  });

  it('re-checks the fields on the server with the §28.7 words, nothing written', async () => {
    const { recordStepAction, handOnAction } = await actions();
    as('processor');
    expect(await recordStepAction({ batchId: w.batchId, process: '', inputKg: '0', outputKg: '' })).toEqual({
      ok: false,
      reason: 'fields',
      errors: { process: 'Choose the process you did.', inputKg: 'Enter a weight above 0 kg in digits, for example 600.0.', outputKg: 'Enter the output weight in kg, for example 480.0.' },
    });
    expect(await handOnAction({ batchId: w.batchId, toOrgId: '' })).toEqual({ ok: false, reason: 'fields', errors: { buyer: 'Choose a buyer from the list.' } });
    expect(await t.db.$count(processingSteps)).toBe(0);
  });

  it("the org comes from the session: another processor's batch is not_found", async () => {
    const { recordStepAction } = await actions();
    as('otherProcessor');
    expect(await recordStepAction(STEP())).toEqual({ ok: false, reason: 'not_found' });
    expect(await t.db.$count(processingSteps)).toBe(0);
  });
});

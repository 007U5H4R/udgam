// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieHeader } from '../../../../../tests/helpers/auth';
import { seedFpo, type FpoWorld } from '../../../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import { checksWith, seedReviewCapture } from '../../../../../tests/helpers/review-world';
import { adminOverrides, harvestEvents, ledgerEntries } from '../../../../lib/db/schema';

// TSK-12.4/12.5 through the Server Actions (TC-056, EVAL-076: "call the override server action directly
// for the hard-failed run, bypassing the UI" → refused with 409, nothing anchored). Guarded (401 signed
// out); the organisation and the admin come from the session: another org's run is unknown (404).

const request = vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
  return { headers: new Headers() };
});
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let t: TempDb;
let a: FpoWorld;
let b: FpoWorld;
const PASSWORD = 'review action password';
const cookies: Record<'a' | 'b', string> = { a: '', b: '' };

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  a = await seedFpo(t.db, { adminPassword: PASSWORD });
  b = await seedFpo(t.db, { adminPassword: PASSWORD });
  const { appAuth } = await import('../../../_auth/auth');
  for (const [k, w] of [
    ['a', a],
    ['b', b],
  ] as const) {
    cookies[k] = cookieHeader(await appAuth().api.signInEmail({ body: { email: w.adminEmail, password: PASSWORD }, asResponse: true }));
  }
}, 30_000);
afterEach(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  request.headers = new Headers();
  await t.cleanup();
});

const as = (who: 'a' | 'b' | null) => {
  request.headers = new Headers(who ? { cookie: cookies[who] } : {});
};
const actions = () => import('./actions');
const REASON = 'Scale photo checked by the office in person';
const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable' } });

describe('review actions', () => {
  it('are guarded: signed out → 401, nothing written', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const before = await t.db.$count(ledgerEntries);
    const { overrideRun, rerunRun } = await actions();
    as(null);
    await expect(overrideRun({ runId: c.runId, newVerdict: 'Verified', reason: REASON })).rejects.toMatchObject({ status: 401 });
    await expect(rerunRun(c.runId)).rejects.toMatchObject({ status: 401 });
    expect(await t.db.$count(ledgerEntries)).toBe(before);
  });

  it('overrideRun on a hard-failed run → 409 hard_fail_final, nothing anchored (TC-056, EVAL-076)', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: checksWith({ photo_uniqueness: { status: 'fail', hardFail: true } }) });
    const before = await t.db.$count(ledgerEntries);
    const { overrideRun } = await actions();
    as('a');
    expect(await overrideRun({ runId: c.runId, newVerdict: 'Verified', reason: REASON })).toEqual({ ok: false, reason: 'hard_fail_final', status: 409 });
    expect(await t.db.$count(ledgerEntries)).toBe(before);
    expect(await t.db.$count(adminOverrides)).toBe(0);
  });

  it('overrideRun: another organisation’s run is unknown (404); the owner’s admin records it', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const { overrideRun } = await actions();
    as('b');
    expect(await overrideRun({ runId: c.runId, newVerdict: 'Verified', reason: REASON })).toEqual({ ok: false, reason: 'not_found', status: 404 });
    as('a');
    expect(await overrideRun({ runId: c.runId, newVerdict: 'Verified', reason: 'short' })).toEqual({ ok: false, reason: 'reason_too_short', status: 400 });
    expect(await overrideRun({ runId: c.runId, newVerdict: 'Needs Review', reason: REASON })).toEqual({ ok: false, reason: 'not_reviewable', status: 409 });
    const r = await overrideRun({ runId: c.runId, newVerdict: 'Verified', reason: REASON });
    expect(r).toMatchObject({ ok: true, reason: REASON });
    const [row] = await t.db.select().from(adminOverrides);
    expect(row).toMatchObject({ runId: c.runId, adminId: a.adminId }); // the admin from the session
    const [e] = await t.db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(eq(harvestEvents.id, c.eventId));
    expect(e!.v).toBe('Verified');
    expect(await overrideRun({ runId: c.runId, newVerdict: 'Rejected', reason: REASON })).toEqual({ ok: false, reason: 'already_decided', status: 409 });
  });

  it('rerunRun: nothing unavailable → 409 nothing_to_rerun; another org → 404', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: checksWith({ yield_plausibility: { status: 'flag' } }) });
    const { rerunRun } = await actions();
    as('a');
    expect(await rerunRun(c.runId)).toEqual({ ok: false, reason: 'nothing_to_rerun', status: 409 });
    as('b');
    expect(await rerunRun(c.runId)).toEqual({ ok: false, reason: 'not_found', status: 404 });
  });
});

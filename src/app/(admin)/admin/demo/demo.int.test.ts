// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// technical-plan TSK-20.3 (TP27, EVAL-074's server half): the staged attacks and /admin/demo. Without
// DEMO_MODE the page is a 404 and the action refuses, sending nothing; with it, an admin's submit posts
// the staged signed payload and photos through the /api/capture handler under the staging phone's
// own agent session, and gets the pipeline's verdict: gps-spoof → Needs Review (geofence fail),
// replay → Rejected (photo_uniqueness), yield-inflation → Rejected (yield_plausibility), plot-laundering
// → Rejected (deforestation_overlap, X01 at 25.0 %).

// A fixed clock, never the wall clock (review minor 3): 1 Oct 2026 00:30 IST, half an hour into a new
// coffee season. The seed squeezes Y01's history into that half hour, and the yield attack submitted at
// the same clock still meets its season total. Date is faked (frozen) for the whole file, so the seed and
// /api/capture's receipt time both read it.
vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T19:00:00.000Z') });

const DATA_DIR = mkdtempSync(join(tmpdir(), 'udgam-demo-'));
process.env.DATA_DIR = DATA_DIR;
delete process.env.DATABASE_URL;
delete process.env.LEDGER_KEY_PATH;
process.env.REMOTE_SENSING_PROVIDER = 'fixture';
process.env.LOG_LEVEL = 'silent';
delete process.env.DEMO_MODE;
delete process.env.E2E;

const request = vi.hoisted(() => ({ headers: new Headers(), cookieSets: 0 }));
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: () => undefined,
    set: () => {
      request.cookieSets += 1;
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

let adminCookie = '';
const count = async (sql: string, args: string[] = []) => {
  const { getDbClient, getDbReady } = await import('../../../../lib/db/client');
  await getDbReady();
  return Number((await getDbClient().execute({ sql, args })).rows[0]!.n);
};
const ledgerCount = () => count('SELECT count(*) AS n FROM ledger_entries');
let agentEmail = '';
/** Live server-side sessions of the staging phone's agent (agent 2). */
const agentSessions = () => count('SELECT count(*) AS n FROM session s JOIN user u ON u.id = s.user_id WHERE u.email = ?', [agentEmail]);

/** Fresh modules under `vars` (env.ts reads process.env once per module instance). */
async function load(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return { actions: await import('./actions'), page: (await import('./page')).default, attacks: await import('./attacks') };
}

beforeAll(async () => {
  const { seed } = await import('../../../../../scripts/seed/run');
  await seed({});
  const { appAuth } = await import('../../../_auth/auth');
  const line = readFileSync(join(DATA_DIR, 'seed-credentials.txt'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('admin\t'))!;
  const [, email, password] = line.split('\t');
  const res = await appAuth().api.signInEmail({ body: { email: email!, password: password! }, asResponse: true });
  adminCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
  agentEmail = (JSON.parse(readFileSync(join(DATA_DIR, 'demo', 'attacks', 'manifest.json'), 'utf8')) as { agentEmail: string }).agentEmail;
}, 240_000);
afterEach(() => {
  request.headers = new Headers();
  delete process.env.DEMO_MODE;
  delete process.env.E2E;
});
afterAll(async () => {
  vi.useRealTimers();
  (await import('../../../../lib/db/client')).closeDb();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

const asAdmin = () => {
  request.headers = new Headers({ cookie: adminCookie });
};

describe('the demo surface switch (TP27)', () => {
  it('is on only with DEMO_MODE=1, and never in a production deployment (E2E=1 is the Playwright server)', async () => {
    const { demoEnabled } = (await load({})).attacks;
    expect(demoEnabled({ NODE_ENV: 'development', E2E: '0', DEMO_MODE: '0' })).toBe(false);
    expect(demoEnabled({ NODE_ENV: 'development', E2E: '0', DEMO_MODE: '1' })).toBe(true);
    expect(demoEnabled({ NODE_ENV: 'test', E2E: '0', DEMO_MODE: '1' })).toBe(true);
    expect(demoEnabled({ NODE_ENV: 'production', E2E: '0', DEMO_MODE: '1' })).toBe(false);
    expect(demoEnabled({ NODE_ENV: 'production', E2E: '1', DEMO_MODE: '1' })).toBe(true);
    expect(demoEnabled({ NODE_ENV: 'production', E2E: '1', DEMO_MODE: '0' })).toBe(false);
  });
});

describe('/admin/demo without DEMO_MODE', () => {
  it('the page is a 404 and the action refuses, sending nothing', async () => {
    asAdmin();
    const { actions, page } = await load({ DEMO_MODE: undefined });
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
    const before = await ledgerCount();
    expect(await actions.submitAttack('replay')).toEqual({ ok: false, reason: 'not_staged', status: 404 });
    expect(await ledgerCount()).toBe(before);
  });
});

describe('/admin/demo with DEMO_MODE=1', () => {
  it('the action is admin-only: signed out → 401, nothing sent', async () => {
    const { actions } = await load({ DEMO_MODE: '1' });
    const before = await ledgerCount();
    await expect(actions.submitAttack('gps-spoof')).rejects.toMatchObject({ status: 401 });
    expect(await ledgerCount()).toBe(before);
  });

  it('the seed staged four signed attacks with their photos', async () => {
    const { attacks } = await load({ DEMO_MODE: '1' });
    const m = (await attacks.readManifest(DATA_DIR))!;
    expect(m.attacks.map((a) => a.id)).toEqual(['gps-spoof', 'replay', 'yield-inflation', 'plot-laundering']);
    for (const a of m.attacks) {
      const payload = readFileSync(join(DATA_DIR, 'demo', 'attacks', a.id, 'payload.json'), 'utf8');
      expect(JSON.parse(payload)).toMatchObject({ v: 1, deviceId: m.deviceId, plotId: a.plotId, cherryKg: a.cherryKg });
      expect((JSON.parse(payload) as { media: unknown[] }).media).toHaveLength(a.photos.length);
    }
  });

  it('each submit goes through /api/capture and returns the verdict and the evidence that caught it', { timeout: 120_000 }, async () => {
    asAdmin();
    const { actions } = await load({ DEMO_MODE: '1' });
    const expected = [
      ['gps-spoof', 'Needs Review', 'geofence', 'fail', false, /^320 m outside the plot edge \(allowance 7 m\)$/],
      ['replay', 'Rejected', 'photo_uniqueness', 'fail', true, /^3 of 3 photos seen before$/],
      ['yield-inflation', 'Rejected', 'yield_plausibility', 'fail', true, /^Season total 2\.02x the reference upper bound/],
      ['plot-laundering', 'Rejected', 'deforestation_overlap', 'fail', true, /^25\.0% of plot area lost since 2021 \(hard fail at 10\.0%\) \(demo data\)$/],
    ] as const;
    for (const [id, verdict, check, status, hardFail, evidence] of expected) {
      const r = await actions.submitAttack(id);
      expect(r, id).toMatchObject({ ok: true, verdict, idempotent: false });
      if (!r.ok) continue;
      const c = r.checks.find((k) => k.id === check)!;
      expect(c, `${id} ${check}`).toMatchObject({ status, hardFail });
      expect(c.evidence).toMatch(evidence);
    }
    // the agent's session was made server-side: nothing was set on the admin's browser
    expect(request.cookieSets).toBe(0);
    // ... and it was revoked after each submit: no live session of the staging agent is left (minor 4)
    expect(await agentSessions()).toBe(0);
  });

  it('a second submit gets the original verdict back (TP7), and the page reads each card from the database', async () => {
    asAdmin();
    const { actions, attacks } = await load({ DEMO_MODE: '1' });
    const again = await actions.submitAttack('replay');
    expect(again).toMatchObject({ ok: true, verdict: 'Rejected', idempotent: true });
    const { getDbReady } = await import('../../../../lib/db/client');
    const m = (await attacks.readManifest(DATA_DIR))!;
    const st = await attacks.attackStatuses(await getDbReady(), 'ORG-HOSAHALLI', m);
    expect(st.map((x) => [x.id, x.submitted?.verdict, x.submitted?.catching?.status])).toEqual([
      ['gps-spoof', 'Needs Review', 'fail'],
      ['replay', 'Rejected', 'fail'],
      ['yield-inflation', 'Rejected', 'fail'],
      ['plot-laundering', 'Rejected', 'fail'],
    ]);
    // another organisation sees none of them as submitted
    expect((await attacks.attackStatuses(await getDbReady(), 'ORG-ELSEWHERE', m)).every((x) => x.submitted === null)).toBe(true);
    expect(await agentSessions()).toBe(0);
  });

  it('an admin of another organisation cannot submit the staged attacks: refused, nothing sent, no session made (nit 9)', async () => {
    const { attacks } = await load({ DEMO_MODE: '1' });
    const { getDbReady } = await import('../../../../lib/db/client');
    const before = await ledgerCount();
    expect(await attacks.submitStaged(await getDbReady(), DATA_DIR, 'gps-spoof', 'ORG-ELSEWHERE')).toEqual({ ok: false, reason: 'not_staged', status: 404 });
    expect(await ledgerCount()).toBe(before);
    expect(await agentSessions()).toBe(0);
  });

  it('the page shows only a known failure code from ?error= (nit 10)', async () => {
    const { attacks } = await load({ DEMO_MODE: '1' });
    expect(attacks.failureOf('refused')).toBe('refused');
    expect(attacks.failureOf('no_session')).toBe('no_session');
    expect(attacks.failureOf('not_staged')).toBe('not_staged');
    expect(attacks.failureOf('failed')).toBe('failed');
    expect(attacks.failureOf('Call +91 00000 for help')).toBeNull();
    expect(attacks.failureOf(['refused'])).toBeNull();
    expect(attacks.failureOf(undefined)).toBeNull();
  });

  it('an unknown attack id is refused', async () => {
    asAdmin();
    const { actions } = await load({ DEMO_MODE: '1' });
    expect(await actions.submitAttack('../../etc/passwd')).toEqual({ ok: false, reason: 'not_staged', status: 404 });
  });

  it('a failed sign-out after the submit is logged without secrets and does not replace the capture’s result (re-review nit 3)', async () => {
    const warn = vi.fn();
    const quiet = vi.fn();
    const logger = { warn, error: quiet, info: quiet, debug: quiet };
    vi.doMock('../../../../lib/log', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../../lib/log')>()),
      log: logger,
      withRequestId: () => logger,
    }));
    vi.doMock('../../../../lib/auth/auth', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../lib/auth/auth')>();
      return {
        ...real,
        createAuth: (...args: Parameters<typeof real.createAuth>) => {
          const auth = real.createAuth(...args);
          return {
            ...auth,
            api: {
              ...auth.api,
              signOut: async () => {
                throw new Error('session store unavailable');
              },
            },
          };
        },
      };
    });
    try {
      const { attacks } = await load({ DEMO_MODE: '1' });
      const { getDbReady } = await import('../../../../lib/db/client');
      const r = await attacks.submitStaged(await getDbReady(), DATA_DIR, 'replay', 'ORG-HOSAHALLI');
      expect(r).toMatchObject({ ok: true, verdict: 'Rejected', idempotent: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith({ errClass: 'Error' }, 'demo.agent_signout_failed');
      // the session the sign-out could not revoke is still there (the log line is the only trace)
      expect(await agentSessions()).toBe(1);
    } finally {
      vi.doUnmock('../../../../lib/log');
      vi.doUnmock('../../../../lib/auth/auth');
    }
  });
});

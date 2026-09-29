// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// The app's Better Auth instance follows the database singleton: after closeDb() it is rebuilt on the
// fresh handle instead of holding the closed client.

let t: TempDb;

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addUser(t.db, { id: 'U-A', email: 'a@a.test', password: 'app auth password', role: 'admin', orgId: 'ORG-A' });
});
afterEach(async () => {
  (await import('../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe('appAuth', () => {
  it('is one instance per database handle', async () => {
    const { appAuth } = await import('./auth');
    expect(appAuth()).toBe(appAuth());
  });

  it('is rebuilt after closeDb() and still signs in', async () => {
    const { appAuth } = await import('./auth');
    const { closeDb } = await import('../../lib/db/client');
    const first = appAuth();
    closeDb();
    const second = appAuth();
    expect(second).not.toBe(first);
    const res = await second.api.signInEmail({ body: { email: 'a@a.test', password: 'app auth password' }, asResponse: true });
    expect(res.status).toBe(200);
  });
});

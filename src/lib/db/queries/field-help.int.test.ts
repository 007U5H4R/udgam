import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedFpo, type FpoWorld } from '../../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../client';
import { devices, organisations } from '../schema';
import { getHelpInfo } from './field-help';

// TSK-11.6 / TC-053: the Help sheet's "Call the office" comes from the organisation's office_phone
// (hidden when null), and "This phone" from the agent's enrolled, unrevoked phones.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-field-help-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db, { orgName: 'Hosahalli FPO' });
});
afterEach(async () => {
  await t.cleanup();
});

describe('getHelpInfo', () => {
  it('has no office phone until the organisation has one (then it is shown as entered)', async () => {
    expect(await getHelpInfo(t.db, w.agentId, w.orgId)).toMatchObject({ orgName: 'Hosahalli FPO', officePhone: null });
    await writeTx(t.db, (tx) => tx.update(organisations).set({ officePhone: '  ' }).where(eq(organisations.id, w.orgId)));
    expect((await getHelpInfo(t.db, w.agentId, w.orgId)).officePhone).toBeNull();
    await writeTx(t.db, (tx) => tx.update(organisations).set({ officePhone: '+91 8272 000 111' }).where(eq(organisations.id, w.orgId)));
    expect((await getHelpInfo(t.db, w.agentId, w.orgId)).officePhone).toBe('+91 8272 000 111');
  });

  it("lists this agent's unrevoked phones only", async () => {
    const [mine] = await t.db.select({ id: devices.id, enrolledAt: devices.enrolledAt }).from(devices).where(eq(devices.agentId, w.agentId));
    const other = await seedFpo(t.db, { orgId: w.orgId, adminId: w.adminId });
    expect((await getHelpInfo(t.db, w.agentId, w.orgId)).phones).toEqual([mine]);
    await writeTx(t.db, (tx) => tx.update(devices).set({ revokedAt: new Date().toISOString() }).where(eq(devices.id, mine!.id)));
    expect((await getHelpInfo(t.db, w.agentId, w.orgId)).phones).toEqual([]);
    expect((await getHelpInfo(t.db, other.agentId, w.orgId)).phones.map((p) => p.id)).toEqual([other.device.id]);
  });
});

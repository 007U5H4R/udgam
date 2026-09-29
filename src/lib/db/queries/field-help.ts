import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client';
import { devices, organisations } from '../schema';

// What the capture app's Help sheet shows (TSK-11.6, TC-053): the office to call (the organisation's
// `office_phone`, hidden when there is none) and this agent's phones that may send pickings, so the
// sheet can name the one in the browser's store ("This phone": its ID and when it was set up). The
// organisation always comes from the session.

export type HelpInfo = {
  orgName: string;
  /** A number to call, as the office entered it; null hides "Call the office". */
  officePhone: string | null;
  /** This agent's enrolled, unrevoked phones. */
  phones: { id: string; enrolledAt: string }[];
};

export async function getHelpInfo(db: Db, agentId: string, orgId: string): Promise<HelpInfo> {
  const [[org], phones] = await Promise.all([
    db.select({ name: organisations.name, officePhone: organisations.officePhone }).from(organisations).where(eq(organisations.id, orgId)),
    db
      .select({ id: devices.id, enrolledAt: devices.enrolledAt })
      .from(devices)
      .where(and(eq(devices.agentId, agentId), isNull(devices.revokedAt)))
      .orderBy(asc(devices.enrolledAt)),
  ]);
  const phone = org?.officePhone?.trim();
  return { orgName: org?.name ?? '', officePhone: phone ? phone : null, phones };
}

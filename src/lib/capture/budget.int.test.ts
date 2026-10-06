// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedTracerWorld } from '../../../scripts/tracer-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice } from '../../../tests/helpers/verify';
import { writeTx } from '../db/client';
import { harvestEvents, media } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import { agentUsageToday, usageQuery } from './budget';

// SEC-003: the usage the daily budget counts comes from what was actually stored: accepted harvest
// events of this agent, received today (India calendar day), and the bytes of their media rows.

let t: TempDb;
/** Two agents, each with an enrolled phone (an accepted event names its device). */
const agents: Record<'A' | 'B', { agentId: string; deviceId: string }> = {} as never;
beforeEach(async () => {
  t = await tempDb();
  for (const k of ['A', 'B'] as const) {
    const w = await seedTracerWorld(t.db, { publicJwk: (await makeDevice()).publicJwk });
    agents[k] = { agentId: w.agentId, deviceId: w.deviceId };
  }
});
afterEach(async () => {
  await t.cleanup();
});

async function event(who: 'A' | 'B', receivedAt: string, sizes: number[], status: 'accepted' | 'rejected' = 'accepted') {
  const { agentId, deviceId } = agents[who];
  await writeTx(t.db, async (tx) => {
    const id = newId('HE-', 12);
    const a = await append(tx, 'harvest_event', { id });
    await tx.insert(harvestEvents).values({ id, agentId, deviceId, serverReceivedAt: receivedAt, payload: '{}', payloadHash: newId('H', 20), signature: 's', boundaryStatus: status, boundaryReason: status === 'rejected' ? 'bad_signature' : null, anchorSeq: a.seq });
    for (const size of sizes) await tx.insert(media).values({ id: newId('ME-', 12), eventId: id, path: 'p', sha256: newId('S', 20), size, mime: 'image/jpeg' });
  });
}

describe('agentUsageToday (SEC-003)', () => {
  const now = new Date('2026-10-06T10:00:00Z'); // IST day: 2026-10-05T18:30Z .. 2026-10-06T18:30Z

  it('counts this agent’s accepted captures and their photo bytes received today, nothing else', async () => {
    await event('A', '2026-10-05T18:30:00.000Z', [100, 200, 300]); // first instant of the day
    await event('A', '2026-10-06T09:59:59.000Z', [1000]);
    await event('A', '2026-10-05T18:29:59.999Z', [5000]); // yesterday (IST)
    await event('A', '2026-10-06T09:00:00.000Z', [7000], 'rejected'); // not accepted
    await event('B', '2026-10-06T09:00:00.000Z', [9000]); // another agent
    expect(await agentUsageToday(t.db, agents.A.agentId, now)).toEqual({ captures: 2, bytes: 1600 });
    expect(await agentUsageToday(t.db, agents.B.agentId, now)).toEqual({ captures: 1, bytes: 9000 });
  });

  it('is zero for an agent with nothing today', async () => {
    expect(await agentUsageToday(t.db, agents.A.agentId, now)).toEqual({ captures: 0, bytes: 0 });
  });

  it('counts a capture with no media row once, at zero bytes', async () => {
    await event('A', '2026-10-06T08:00:00.000Z', []);
    expect(await agentUsageToday(t.db, agents.A.agentId, now)).toEqual({ captures: 1, bytes: 0 });
  });

  it('reads through the (agent_id, boundary_status, server_received_at) index, in one query', async () => {
    await event('A', '2026-10-06T08:00:00.000Z', [10, 20]);
    const q = usageQuery(t.db, agents.A.agentId, now).toSQL();
    const plan = (await t.client.execute({ sql: `EXPLAIN QUERY PLAN ${q.sql}`, args: q.params as never })).rows.map((r) => String(r.detail));
    expect(plan.join('\n')).toMatch(/SEARCH \w+ USING (COVERING )?INDEX harvest_events_agent_day_idx \(agent_id=\? AND boundary_status=\? AND server_received_at>\? AND server_received_at<\?\)/);
    expect(plan.join('\n')).not.toMatch(/SCAN harvest_events\b/);
  });
});

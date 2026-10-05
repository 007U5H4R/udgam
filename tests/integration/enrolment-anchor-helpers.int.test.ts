import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, jwkThumbprint, publicMembers } from '../../src/lib/crypto';
import { issueCode } from '../../src/lib/enrolment/codes';
import { enrolDevice } from '../../src/lib/enrolment/enrol';
import { newId } from '../../src/lib/ids';
import { seedTracerWorld } from '../../scripts/tracer-world';
import { seedBatchWorld } from '../helpers/batch-world';
import { seedFpo } from '../helpers/batch-fixtures';
import { tempDb, type TempDb } from '../helpers/db';

// TKT-20 spec review S4 (carry-forward): the seed helpers must anchor `device_enrolled` exactly as phone
// enrolment does, {deviceId, agentId, thumbprint} with the key's RFC 7638 thumbprint, not the old
// {deviceId, agentId, kid, publicJwk, enrolledAt}. Each helper's entry is compared with the real path's.

let t: TempDb;
beforeAll(async () => {
  t = await tempDb();
});
afterAll(async () => {
  await t.cleanup();
});

type Anchored = { payload: Record<string, unknown>; thumbprint: string; publicJwk: JsonWebKey; agentId: string; lastSeq: number; lastEventHash: string | null };

/** The device row and its device_enrolled ledger entry. */
async function anchoredDevice(deviceId: string): Promise<Anchored> {
  const r = await t.client.execute({
    sql: 'SELECT l.kind, l.payload, d.key_thumbprint, d.public_key_jwk, d.agent_id, d.last_seq, d.last_event_hash FROM devices d JOIN ledger_entries l ON l.seq = d.anchor_seq WHERE d.id = ?',
    args: [deviceId],
  });
  const row = r.rows[0]!;
  expect(row.kind).toBe('device_enrolled');
  return {
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
    thumbprint: String(row.key_thumbprint),
    publicJwk: JSON.parse(String(row.public_key_jwk)) as JsonWebKey,
    agentId: String(row.agent_id),
    lastSeq: Number(row.last_seq),
    lastEventHash: row.last_event_hash === null ? null : String(row.last_event_hash),
  };
}

/** What every helper's device must look like: the shape and derivation the real enrolment writes. */
async function expectAsEnrolment(deviceId: string) {
  const d = await anchoredDevice(deviceId);
  expect(Object.keys(d.payload).sort()).toEqual(['agentId', 'deviceId', 'thumbprint']);
  expect(d.payload).toEqual({ deviceId, agentId: d.agentId, thumbprint: d.thumbprint });
  expect(d.thumbprint).toBe(await jwkThumbprint(publicMembers(d.publicJwk)));
  expect(d.thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect([d.lastSeq, d.lastEventHash]).toEqual([0, null]);
}

describe('seed helpers anchor device_enrolled as enrolment does (S4)', () => {
  it('the real path (issueCode + enrolDevice): {deviceId, agentId, thumbprint}', async () => {
    const fpo = await seedFpo(t.db); // an org, an admin and an agent to enrol a second phone for
    const pair = await generateKeyPair(false);
    const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
    const { code } = await issueCode(t.db, { agentId: fpo.agentId, adminId: fpo.adminId, orgId: fpo.orgId });
    const r = await enrolDevice(t.db, { code, publicJwk, ip: '198.18.40.1', sessionAgentId: fpo.agentId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await expectAsEnrolment(r.deviceId);
    expect((await anchoredDevice(r.deviceId)).thumbprint).toBe(await jwkThumbprint(publicJwk));
  });

  it('scripts/tracer-world.ts seedTracerWorld', async () => {
    const pair = await generateKeyPair(false);
    const publicJwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
    const w = await seedTracerWorld(t.db, { publicJwk });
    await expectAsEnrolment(w.deviceId);
    expect((await anchoredDevice(w.deviceId)).thumbprint).toBe(await jwkThumbprint(publicJwk));
  });

  it('tests/helpers/batch-world.ts seedBatchWorld (two phones)', async () => {
    const w = await seedBatchWorld(t.db, { events: 2, plots: 1, devices: 2 });
    expect(w.deviceIds).toHaveLength(2);
    for (const id of w.deviceIds) {
      const d = await anchoredDevice(id);
      expect(Object.keys(d.payload).sort()).toEqual(['agentId', 'deviceId', 'thumbprint']);
      expect(d.payload).toEqual({ deviceId: id, agentId: d.agentId, thumbprint: d.thumbprint });
      expect(d.thumbprint).toBe(await jwkThumbprint(publicMembers(d.publicJwk)));
    }
  });

  it('tests/helpers/batch-fixtures.ts seedFpo', async () => {
    const w = await seedFpo(t.db, { orgName: `FPO ${newId('X-')}` });
    await expectAsEnrolment(w.device.id);
    expect((await anchoredDevice(w.device.id)).thumbprint).toBe(await jwkThumbprint(w.device.publicJwk));
  });
});

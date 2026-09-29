import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_ORGS, seedAccounts } from '../../../scripts/seed-accounts';
import { addOrg, addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { generateKeyPair, jwkThumbprint, publicMembers } from '../crypto';
import { verifyChain } from '../ledger/hashchain';
import { issueCode } from './codes';
import { enrolDevice, revokeDevice } from './enrol';
import { NotFoundError } from './errors';

// TSK-05.3 · TC-022 (server part), TC-023 (revocation anchored), EVAL-082.
let t: TempDb;
const PW = 'enrol device password';
const T0 = new Date('2026-10-14T04:00:00.000Z');
const IP = '203.0.113.9';

beforeEach(async () => {
  t = await tempDb();
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-B', 'fpo');
  await addUser(t.db, { id: 'U-AGENT-A', email: 'agent-a@x.test', password: PW, role: 'agent', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-AGENT-A2', email: 'agent-a2@x.test', password: PW, role: 'agent', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin-a@x.test', password: PW, role: 'admin', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-ADMIN-B', email: 'admin-b@x.test', password: PW, role: 'admin', orgId: 'ORG-B' });
});
afterEach(async () => {
  await t.cleanup();
});

async function publicJwk(): Promise<JsonWebKey> {
  const pair = await generateKeyPair(false);
  return publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)); // what the phone sends
}
const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** The same 32 bytes with a different last character: a 43-char base64url string has 2 unused low bits. */
const flipTrailingBit = (s: string) => s.slice(0, -1) + B64U[B64U.indexOf(s.at(-1)!) ^ 1]!;
/** A public JWK whose x and y each contain '-' or '_', so the '+/' variant really differs. */
async function keyWithUrlSafeChars(): Promise<JsonWebKey> {
  for (;;) {
    const jwk = await publicJwk();
    if (/[-_]/.test(jwk.x!) && /[-_]/.test(jwk.y!)) return jwk;
  }
}
const code = async (now = T0) => (await issueCode(t.db, { agentId: 'U-AGENT-A', adminId: 'U-ADMIN-A', orgId: 'ORG-A' }, now)).code;
const rows = async (sql: string) => (await t.client.execute(sql)).rows.map((r) => ({ ...r }));
const deviceCount = async () => Number((await rows('SELECT COUNT(*) AS n FROM devices'))[0]!.n);
const enrolledEntries = () => rows(`SELECT seq, payload FROM ledger_entries WHERE kind = 'device_enrolled'`);

describe('enrolDevice', () => {
  it('TC-022 stores the public key and thumbprint and anchors device_enrolled {deviceId, agentId, thumbprint}', async () => {
    const jwk = await publicJwk();
    const r = await enrolDevice(t.db, { code: await code(), publicJwk: jwk, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    expect(r).toEqual({ ok: true, deviceId: expect.stringMatching(/^DV-[0-9A-HJKMNP-TV-Z]{8}$/), seq: 0, lastEventHash: null });
    if (!r.ok) return;
    const thumbprint = await jwkThumbprint(jwk);
    const [dev] = await rows('SELECT * FROM devices');
    expect(dev).toMatchObject({ id: r.deviceId, agent_id: 'U-AGENT-A', key_thumbprint: thumbprint, enrolled_at: T0.toISOString(), revoked_at: null, last_seq: 0, last_event_hash: null });
    expect(JSON.parse(String(dev!.public_key_jwk))).toEqual({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
    const entries = await enrolledEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.parse(String(entries[0]!.payload))).toEqual({ deviceId: r.deviceId, agentId: 'U-AGENT-A', thumbprint });
    expect(dev!.anchor_seq).toBe(entries[0]!.seq);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('refuses a JWK carrying a private component `d`, or anything but a P-256 public key; the code stays unused', async () => {
    const c = await code();
    const pair = await generateKeyPair(true);
    const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
    expect(privateJwk.d).toBeTypeOf('string');
    const good = await publicJwk();
    for (const bad of [
      privateJwk,
      { ...good, d: 'AAAA' },
      { ...good, crv: 'P-384' },
      { ...good, kty: 'RSA' },
      { kty: 'EC', crv: 'P-256', x: good.x },
      { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' }, // not a point on the curve
      'not a key' as unknown as JsonWebKey,
    ]) {
      expect(await enrolDevice(t.db, { code: c, publicJwk: bad, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).toEqual({ ok: false, reason: 'bad_key' });
    }
    expect(await deviceCount()).toBe(0);
    expect(await enrolledEntries()).toEqual([]);
    expect((await enrolDevice(t.db, { code: c, publicJwk: good, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).ok).toBe(true);
  });

  it('EVAL-082 a used code, an expired code (24 h + 1 min) and another agent’s code all fail; nothing is created', async () => {
    const used = await code();
    expect((await enrolDevice(t.db, { code: used, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).ok).toBe(true);
    const before = { devices: await deviceCount(), entries: (await enrolledEntries()).length };

    expect(await enrolDevice(t.db, { code: used, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).toEqual({ ok: false, reason: 'used' });
    const late = await code();
    expect(
      await enrolDevice(t.db, { code: late, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, new Date(T0.getTime() + 24 * 3600_000 + 60_000)),
    ).toEqual({ ok: false, reason: 'expired' });
    const forA = await code();
    expect(await enrolDevice(t.db, { code: forA, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A2' }, T0)).toEqual({ ok: false, reason: 'invalid' });

    expect(await deviceCount()).toBe(before.devices);
    expect(await enrolledEntries()).toHaveLength(before.entries);
  });

  it('refuses a key that is already enrolled, without spending the code', async () => {
    const jwk = await publicJwk();
    expect((await enrolDevice(t.db, { code: await code(), publicJwk: jwk, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).ok).toBe(true);
    const second = await code();
    expect(await enrolDevice(t.db, { code: second, publicJwk: jwk, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).toEqual({ ok: false, reason: 'key_in_use' });
    expect((await rows('SELECT used_at FROM enrollment_codes WHERE used_at IS NULL')).length).toBe(1);
  });

  it('Fix 1 (major 1): only the canonical {kty, crv, x, y} with 43-character base64url coordinates is accepted', async () => {
    const good = await publicJwk();
    const c = await code();
    for (const bad of [
      { kty: 'EC', crv: 'P-256', x: `${good.x}=`, y: good.y }, // padded
      { kty: 'EC', crv: 'P-256', x: good.x, y: `${good.y}=` },
      { kty: 'EC', crv: 'P-256', x: good.x!.replace(/-/g, '+').replace(/_/g, '/') + '+', y: good.y }, // standard alphabet
      { kty: 'EC', crv: 'P-256', x: good.x, y: good.y, alg: 'ES256' }, // extra members
      { kty: 'EC', crv: 'P-256', x: good.x, y: good.y, key_ops: ['verify'], ext: true },
      { kty: 'EC', crv: 'P-256', x: good.x!.slice(1), y: good.y },
    ]) {
      expect(await enrolDevice(t.db, { code: c, publicJwk: bad, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0), JSON.stringify(Object.keys(bad))).toEqual({
        ok: false,
        reason: 'bad_key',
      });
    }
    expect(await deviceCount()).toBe(0);
  });

  it('Fix 1 (major 1): a revoked key re-posted in any alternate encoding is refused and never becomes a new device', async () => {
    const jwk = await keyWithUrlSafeChars();
    const r = await enrolDevice(t.db, { code: await code(), publicJwk: jwk, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    if (!r.ok) throw new Error(r.reason);
    await revokeDevice(t.db, { deviceId: r.deviceId, adminOrgId: 'ORG-A' });
    const variants: Record<string, JsonWebKey> = {
      canonical: jwk,
      trailingBitsX: { ...jwk, x: flipTrailingBit(jwk.x!) },
      trailingBitsY: { ...jwk, y: flipTrailingBit(jwk.y!) },
      padded: { ...jwk, x: `${jwk.x}=` },
      plusSlash: { ...jwk, x: jwk.x!.replace(/-/g, '+').replace(/_/g, '/'), y: jwk.y!.replace(/-/g, '+').replace(/_/g, '/') },
      extraMembers: { ...jwk, alg: 'ES256', key_ops: ['verify'] } as JsonWebKey,
    };
    const got: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(variants)) {
      const res = await enrolDevice(t.db, { code: await code(), publicJwk: v, ip: `198.51.100.${Object.keys(got).length}`, sessionAgentId: 'U-AGENT-A' }, T0);
      got[name] = res.ok ? `ENROLLED ${res.deviceId}` : res.reason;
    }
    expect(got).toEqual({
      canonical: 'key_revoked',
      trailingBitsX: 'key_revoked', // decodes to the same point: re-exported and thumbprinted canonically
      trailingBitsY: 'key_revoked',
      padded: 'bad_key',
      plusSlash: 'bad_key',
      extraMembers: 'bad_key',
    });
    expect(await deviceCount()).toBe(1);
  });

  it('Fix 1 (major 1): the stored JWK and thumbprint come from the re-exported key', async () => {
    const jwk = await publicJwk();
    const r = await enrolDevice(t.db, { code: await code(), publicJwk: { ...jwk, x: flipTrailingBit(jwk.x!) }, ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    if (!r.ok) throw new Error(r.reason);
    const [dev] = await rows('SELECT public_key_jwk, key_thumbprint FROM devices');
    expect(JSON.parse(String(dev!.public_key_jwk))).toEqual({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
    expect(dev!.key_thumbprint).toBe(await jwkThumbprint(jwk));
  });

  it('two racing redemptions of one code: exactly one enrols', async () => {
    const c = await code();
    const [a, b] = await Promise.all([
      enrolDevice(t.db, { code: c, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0),
      enrolDevice(t.db, { code: c, publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0),
    ]);
    expect([a.ok ? 'ok' : a.reason, b.ok ? 'ok' : b.reason].sort()).toEqual(['ok', 'used']);
    expect(await deviceCount()).toBe(1);
  });

  it('rate limits stick although the enrolment is refused (the refusal commits its counts)', async () => {
    for (let i = 0; i < 10; i++) await enrolDevice(t.db, { code: 'ZZZZZ' + CODE_CHARS[i], publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    expect(await enrolDevice(t.db, { code: await code(), publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0)).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });

  it('TC-022 (EXE13, EV16) the anchored device_enrolled payload of a seeded agent carries only IDs and a hash: no email, name or org', async () => {
    await seedAccounts(t.db, PW, T0);
    const agent = DEMO_ACCOUNTS.agentA;
    const org = DEMO_ORGS.fpoA;
    const issued = await issueCode(t.db, { agentId: agent.id, adminId: DEMO_ACCOUNTS.adminA.id, orgId: org.id }, T0);
    const r = await enrolDevice(t.db, { code: issued.code, publicJwk: await publicJwk(), ip: IP, sessionAgentId: agent.id }, T0);
    expect(r.ok).toBe(true);
    const entries = await enrolledEntries();
    expect(entries).toHaveLength(1);
    const payload = JSON.parse(String(entries[0]!.payload)) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['agentId', 'deviceId', 'thumbprint']);
    const agentId = String(payload.agentId);
    expect(agentId).toBe(agent.id);
    expect(agentId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(agentId).not.toContain('@');
    expect([agent.email, agent.name, agent.orgId]).not.toContain(agentId);
    expect(agentId.toUpperCase()).not.toContain(org.name.split(' ')[0]!.toUpperCase()); // "HOSAHALLI"
    expect(agentId.toUpperCase()).not.toContain(org.name.toUpperCase());
    expect(JSON.stringify(payload)).not.toMatch(/hosahalli|udgam\.test|agent@|field agent/i);
  });
});
const CODE_CHARS = '23456789AB';

describe('revokeDevice (TC-023)', () => {
  it('sets revoked_at and anchors device_revoked {deviceId, revokedAt}', async () => {
    const r = await enrolDevice(t.db, { code: await code(), publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    if (!r.ok) throw new Error('enrol failed');
    const at = new Date('2026-10-15T09:30:00.000Z');
    expect(await revokeDevice(t.db, { deviceId: r.deviceId, adminOrgId: 'ORG-A' }, at)).toEqual({ deviceId: r.deviceId, revokedAt: at.toISOString() });
    const [dev] = await rows(`SELECT revoked_at FROM devices`);
    expect(dev!.revoked_at).toBe(at.toISOString());
    const entries = await rows(`SELECT payload FROM ledger_entries WHERE kind = 'device_revoked'`);
    expect(entries.map((e) => JSON.parse(String(e.payload)))).toEqual([{ deviceId: r.deviceId, revokedAt: at.toISOString() }]);
    // revoking again changes nothing and anchors nothing new
    expect(await revokeDevice(t.db, { deviceId: r.deviceId, adminOrgId: 'ORG-A' }, new Date())).toEqual({ deviceId: r.deviceId, revokedAt: at.toISOString() });
    expect(await rows(`SELECT seq FROM ledger_entries WHERE kind = 'device_revoked'`)).toHaveLength(1);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it("revoking another org's device (or an unknown one) is NotFoundError, and nothing changes", async () => {
    const r = await enrolDevice(t.db, { code: await code(), publicJwk: await publicJwk(), ip: IP, sessionAgentId: 'U-AGENT-A' }, T0);
    if (!r.ok) throw new Error('enrol failed');
    await expect(revokeDevice(t.db, { deviceId: r.deviceId, adminOrgId: 'ORG-B' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeDevice(t.db, { deviceId: 'DV-NOPE0000', adminOrgId: 'ORG-A' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await rows('SELECT revoked_at FROM devices'))[0]!.revoked_at).toBeNull();
    expect(await rows(`SELECT seq FROM ledger_entries WHERE kind = 'device_revoked'`)).toEqual([]);
  });
});

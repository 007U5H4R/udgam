import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addOrg, addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { sha256Hex } from '../crypto';
import { writeTx } from '../db/client';
import { createLogger } from '../log';
import { CODE_ALPHABET, issueCode, redeemCode, type RedeemResult } from './codes';
import { NotFoundError } from './errors';

// TSK-05.2 · TC-021, EVAL-082: codes are stored hashed, single use, expire after 24 h, and are limited
// to 5 attempts per code and 10 per IP per hour; no refusal logs the code.
let t: TempDb;
const PW = 'enrolment codes password';
const T0 = new Date('2026-10-14T04:00:00.000Z');
const IP = '203.0.113.7';
const at = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(async () => {
  t = await tempDb();
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-B', 'fpo');
  await addUser(t.db, { id: 'U-AGENT-A', email: 'agent-a@x.test', password: PW, role: 'agent', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-AGENT-A2', email: 'agent-a2@x.test', password: PW, role: 'agent', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin-a@x.test', password: PW, role: 'admin', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-AGENT-B', email: 'agent-b@x.test', password: PW, role: 'agent', orgId: 'ORG-B' });
});
afterEach(async () => {
  await t.cleanup();
});

const issue = (now = T0, agentId = 'U-AGENT-A') => issueCode(t.db, { agentId, adminId: 'U-ADMIN-A', orgId: 'ORG-A' }, now);
const redeem = (code: string, now = T0, ip = IP, opts: Parameters<typeof redeemCode>[4] = {}): Promise<RedeemResult> =>
  writeTx(t.db, (tx) => redeemCode(tx, code, now, ip, opts));

function captured() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { log: createLogger('info', stream), text: () => lines.join('') };
}

describe('issueCode', () => {
  it('makes a 6-character code from the 31-symbol alphabet, expiring after 24 h, and stores only its hash', async () => {
    expect(CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    const { code, expiresAt } = await issue();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(expiresAt).toBe('2026-10-15T04:00:00.000Z');
    const rows = (await t.client.execute('SELECT * FROM enrollment_codes')).rows.map((r) => ({ ...r }));
    expect(rows).toEqual([
      { code_hash: await sha256Hex(code), agent_id: 'U-AGENT-A', created_by: 'U-ADMIN-A', expires_at: expiresAt, used_at: null, attempts: 0 },
    ]);
    // the plain code appears nowhere in the database file's tables
    for (const table of ['enrollment_codes', 'rate_limits']) {
      const dump = JSON.stringify((await t.client.execute(`SELECT * FROM ${table}`)).rows);
      expect(dump).not.toContain(code);
    }
  });

  it('codes differ', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add((await issue()).code);
    expect(codes.size).toBe(20);
  });

  it("refuses an agent or admin outside the admin's org with NotFoundError (EVAL-080)", async () => {
    await expect(issueCode(t.db, { agentId: 'U-AGENT-B', adminId: 'U-ADMIN-A', orgId: 'ORG-A' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueCode(t.db, { agentId: 'U-AGENT-A', adminId: 'U-ADMIN-A', orgId: 'ORG-B' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueCode(t.db, { agentId: 'U-ADMIN-A', adminId: 'U-ADMIN-A', orgId: 'ORG-A' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM enrollment_codes')).rows[0]!.n).toBe(0);
  });
});

describe('redeemCode (TC-021, EVAL-082)', () => {
  it('redeems once, then the used code fails', async () => {
    const { code } = await issue();
    expect(await redeem(code)).toEqual({ ok: true, agentId: 'U-AGENT-A' });
    expect(await redeem(code)).toEqual({ ok: false, reason: 'used' });
    const row = (await t.client.execute('SELECT used_at FROM enrollment_codes')).rows[0]!;
    expect(row.used_at).toBe(T0.toISOString());
  });

  it('accepts lower case and spaces around the code', async () => {
    const { code } = await issue();
    expect(await redeem(` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `)).toEqual({ ok: true, agentId: 'U-AGENT-A' });
  });

  it('works just before 24 h and fails at 24 h + 1 s (injected clock)', async () => {
    const a = await issue();
    const b = await issue();
    expect(await redeem(a.code, at(24 * 3600_000 - 1000))).toEqual({ ok: true, agentId: 'U-AGENT-A' });
    expect(await redeem(b.code, at(24 * 3600_000 + 1000))).toEqual({ ok: false, reason: 'expired' });
  });

  it('an unknown or malformed code is invalid', async () => {
    expect(await redeem('ZZZZZZ')).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeem('ABC1O0')).toEqual({ ok: false, reason: 'invalid' }); // 1, O and 0 are not in the alphabet
    expect(await redeem('')).toEqual({ ok: false, reason: 'invalid' });
  });

  it("a code issued for agent A is refused for agent B's session and stays usable by A (EVAL-082)", async () => {
    const { code } = await issue();
    expect(await redeem(code, T0, IP, { agentId: 'U-AGENT-A2' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeem(code, T0, IP, { agentId: 'U-AGENT-A' })).toEqual({ ok: true, agentId: 'U-AGENT-A' });
  });

  it('the 6th wrong attempt on a code is rate_limited, even with the right session afterwards', async () => {
    const { code } = await issue();
    const ips = ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4', '198.51.100.5', '198.51.100.6'];
    for (const ip of ips.slice(0, 5)) expect(await redeem(code, T0, ip, { agentId: 'U-AGENT-A2' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeem(code, T0, ips[5], { agentId: 'U-AGENT-A' })).toEqual({ ok: false, reason: 'rate_limited' });
    expect((await t.client.execute('SELECT used_at, attempts FROM enrollment_codes')).rows[0]).toMatchObject({ used_at: null, attempts: 6 });
  });

  it('the 6th try of one unknown code is rate_limited (per code hash, across IPs)', async () => {
    for (let i = 0; i < 5; i++) expect(await redeem('ZZZZZZ', T0, `198.51.100.${i}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeem('ZZZZZZ', T0, '198.51.100.99')).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('the 11th attempt from one IP within the hour is rate_limited, even with a valid code; the next hour resets', async () => {
    const { code } = await issue();
    const wrong = ['222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', 'AAAAAA', 'BBBBBB'];
    for (const w of wrong) expect(await redeem(w, at(1000))).toEqual({ ok: false, reason: 'invalid' });
    expect(await redeem(code, at(2000))).toEqual({ ok: false, reason: 'rate_limited' });
    expect(await redeem(code, at(2000), '192.0.2.44')).toEqual({ ok: true, agentId: 'U-AGENT-A' });
    const other = await issue();
    expect(await redeem(other.code, at(3600_000))).toEqual({ ok: true, agentId: 'U-AGENT-A' });
  });

  it('logs each refusal with its reason and never the code or its hash', async () => {
    const { code } = await issue();
    const expired = await issue();
    const cap = captured();
    const opts = { log: cap.log };
    await redeem(code, T0, IP, opts);
    await redeem(code, T0, IP, opts); // used
    await redeem('ZZZZZZ', T0, IP, opts); // invalid
    await redeem(expired.code, at(25 * 3600_000), IP, opts); // expired
    for (let i = 0; i < 8; i++) await redeem('YYYYYY', T0, IP, opts); // invalid, then the IP limit
    const out = cap.text();
    for (const secret of [code, expired.code, 'ZZZZZZ', 'YYYYYY', await sha256Hex(code), await sha256Hex('ZZZZZZ')]) expect(out).not.toContain(secret);
    const reasons = out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { msg: string; reason?: string })
      .filter((l) => l.msg === 'enrol.code_refused')
      .map((l) => l.reason);
    expect(reasons).toContain('used');
    expect(reasons).toContain('invalid');
    expect(reasons).toContain('expired');
    expect(reasons).toContain('rate_limited');
  });
});

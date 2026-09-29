import { describe, expect, it } from 'vitest';
import { health } from './health';

const base = { version: '1.2.3', commit: 'abc1234' };

describe('health (TC-001 core)', () => {
  it('reports 200 with fixture providers when the ping succeeds', async () => {
    const r = await health({ ...base, ping: async () => {} });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      db: 'ok',
      providers: { gfw: 'fixture', sentinelHub: 'fixture' },
      version: '1.2.3',
      commit: 'abc1234',
    });
  });

  it('reports 503 with db:error when the ping throws', async () => {
    const r = await health({
      ...base,
      ping: async () => {
        throw new Error('boom');
      },
    });
    expect(r.status).toBe(503);
    expect(r.body.db).toBe('error');
  });

  it('is 503 when the ledger key is missing (typed optional field for TKT-15)', async () => {
    const r = await health({
      ...base,
      ping: async () => {},
      ledger: { lastSeq: 3, lastCheckpointAgeSec: 10, keyPresent: false },
    });
    expect(r.status).toBe(503);
    expect(r.body.ledger?.keyPresent).toBe(false);
  });

  it('names a configuration fault as config:error with db:unchecked, not as a database fault (QA-P1-1)', async () => {
    let pinged = false;
    const r = await health({
      ...base,
      config: 'error',
      ping: async () => {
        pinged = true;
      },
    });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ config: 'error', db: 'unchecked' });
    expect(pinged).toBe(false);
  });

  it('reports config:ok when the route says so', async () => {
    const r = await health({ ...base, config: 'ok', ping: async () => {} });
    expect(r.status).toBe(200);
    expect(r.body.config).toBe('ok');
  });

  it('carries no environment value in the body', async () => {
    const canary = 'canary-'.repeat(4); // low-entropy on purpose: not scan bait
    process.env.UDGAM_HEALTH_CANARY = canary;
    try {
      const r = await health({
        ...base,
        ping: async () => {
          throw new Error(canary);
        },
      });
      expect(JSON.stringify(r.body)).not.toContain(canary);
    } finally {
      delete process.env.UDGAM_HEALTH_CANARY;
    }
  });
});

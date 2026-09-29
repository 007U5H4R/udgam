import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './log';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

describe('logger redaction (technical-plan §15)', () => {
  it('redacts secrets at every documented depth with the pino default censor', () => {
    const { stream, lines } = capture();
    const l = createLogger('info', stream);
    const v = 'v-'.repeat(8); // low-entropy on purpose: not scan bait
    l.info({
      authorization: v,
      cookie: v,
      signature: v,
      password: v,
      headers: { authorization: v, cookie: v },
      req: { headers: { authorization: v, cookie: v } },
      ctx: { req: { headers: { authorization: v, cookie: v } } },
      a: { secret: v, key: v, signature: v, password: v },
    });
    const out = lines.join('');
    expect(out).not.toContain(v);
    expect(out).toContain('[Redacted]');
    expect(out).not.toContain('[redacted]');
  });

  it('keeps ordinary fields', () => {
    const { stream, lines } = capture();
    createLogger('info', stream).info({ requestId: 'r1', req: { headers: { accept: 'json' } } }, 'hello');
    const out = lines.join('');
    expect(out).toContain('r1');
    expect(out).toContain('json');
  });
});

describe('log proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('forwards writes to the underlying logger so log.level can be changed', async () => {
    vi.resetModules();
    vi.stubEnv('LOG_LEVEL', 'info');
    const { log } = await import('./log');
    expect(log.level).toBe('info');
    log.level = 'debug';
    expect(log.level).toBe('debug');
    expect(log.isLevelEnabled('debug')).toBe(true);
  });

  it('falls back to info instead of throwing when the environment is invalid', async () => {
    vi.resetModules();
    vi.stubEnv('LOG_LEVEL', 'not-a-level');
    const { log } = await import('./log');
    expect(log.level).toBe('info');
  });
});

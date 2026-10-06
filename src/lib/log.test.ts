import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECRET_ENV_NAMES } from './config/secret-names';
import { createLogger, errFields } from './log';

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

  it('TSK-19.6 / TC-075: credentials, signatures, provider keys and env secrets are [Redacted]', () => {
    const { stream, lines } = capture();
    createLogger('info', stream).info({
      authorization: 'Bearer x',
      cookie: 'a=b',
      signature: 'sig',
      password: 'p',
      gfw: { key: 'k' },
      env: { BETTER_AUTH_SECRET: 's', GFW_API_KEY: 'g', CDSE_CLIENT_SECRET: 'c', ARCGIS_API_KEY: 'a', MAPTILER_KEY: 'm' },
    });
    const out = JSON.parse(lines.join('')) as Record<string, unknown>;
    expect(out).toMatchObject({
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      signature: '[Redacted]',
      password: '[Redacted]',
      gfw: { key: '[Redacted]' },
      env: { BETTER_AUTH_SECRET: '[Redacted]', GFW_API_KEY: '[Redacted]', CDSE_CLIENT_SECRET: '[Redacted]', ARCGIS_API_KEY: '[Redacted]', MAPTILER_KEY: '[Redacted]' },
    });
  });

  it('redacts every name of the one shared secret list (the bundle check uses the same list), top level and nested', () => {
    const { stream, lines } = capture();
    const v = 'w-'.repeat(8);
    const all = Object.fromEntries(SECRET_ENV_NAMES.map((n) => [n, v]));
    createLogger('info', stream).info({ ...all, env: all });
    const out = JSON.parse(lines.join('')) as Record<string, unknown>;
    for (const n of SECRET_ENV_NAMES) {
      expect(out[n], n).toBe('[Redacted]');
      expect((out.env as Record<string, unknown>)[n], `env.${n}`).toBe('[Redacted]');
    }
    expect(lines.join('')).not.toContain(v);
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

describe('errFields (CR-007)', () => {
  it('names the class and the driver code, never the message', () => {
    const busy = Object.assign(new Error('SQLITE_BUSY: database is locked at /srv/udgam/udgam.db'), { code: 'SQLITE_BUSY', rawCode: 5 });
    expect(errFields(busy)).toEqual({ errClass: 'Error', code: 'SQLITE_BUSY', rawCode: 5 });
    expect(JSON.stringify(errFields(busy))).not.toContain('/srv');
  });

  it('finds the code on a wrapped cause (drizzle wraps the driver error)', () => {
    class DrizzleQueryError extends Error {}
    const inner = Object.assign(new Error('SQLITE_FULL: database or disk is full'), { code: 'SQLITE_FULL', rawCode: 13 });
    expect(errFields(new DrizzleQueryError('Failed query: insert into …', { cause: inner }))).toEqual({ errClass: 'DrizzleQueryError', code: 'SQLITE_FULL', rawCode: 13 });
  });

  it('a plain error is its class only; a code that is not a constant-style name is left out', () => {
    expect(errFields(new Error('boom'))).toEqual({ errClass: 'Error' });
    expect(errFields(Object.assign(new Error('x'), { code: 'see /etc/passwd' }))).toEqual({ errClass: 'Error' });
    expect(errFields('nope')).toEqual({ errClass: 'string' });
  });
});

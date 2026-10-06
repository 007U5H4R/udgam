// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDevState } from './dev-state';

// TSK-16.6 · EVAL-088: the certificate's forced states are reachable outside production and on the
// Playwright server (E2E=1), and `?state=` is ignored in a production deployment — checked against the
// real environment parsing (lib/config/env.ts), as the page passes it.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function envWith(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', vars.NODE_ENV ?? 'test');
  vi.stubEnv('E2E', vars.E2E ?? '');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', vars.REMOTE_SENSING_PROVIDER ?? 'fixture');
  vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32));
  vi.stubEnv('LOG_LEVEL', 'silent');
  // A production deployment runs the live provider; these placeholders only satisfy the schema (never sent).
  for (const name of ['GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET']) vi.stubEnv(name, 'test-placeholder');
  for (const name of ['PUBLIC_BASE_URL', 'BETTER_AUTH_URL']) vi.stubEnv(name, 'https://udgam.example'); // https in production (DES-219)
  const { env } = await import('../config/env');
  return { NODE_ENV: env.NODE_ENV, E2E: env.E2E };
}

describe('resolveDevState (TSK-16.6, EVAL-088)', () => {
  it('development and test: loading and mismatch are forced; anything else is not', async () => {
    const env = await envWith({ NODE_ENV: 'development' });
    expect(resolveDevState({ state: 'loading' }, env)).toBe('loading');
    expect(resolveDevState({ state: 'mismatch' }, env)).toBe('mismatch');
    expect(resolveDevState({ state: 'verified' }, env)).toBeNull();
    expect(resolveDevState({ state: ['loading'] }, env)).toBeNull();
    expect(resolveDevState({}, env)).toBeNull();
  });

  it('a production deployment ignores ?state=', async () => {
    const env = await envWith({ NODE_ENV: 'production', REMOTE_SENSING_PROVIDER: 'live' });
    expect(env).toEqual({ NODE_ENV: 'production', E2E: '0' });
    expect(resolveDevState({ state: 'loading' }, env)).toBeNull();
    expect(resolveDevState({ state: 'mismatch' }, env)).toBeNull();
  });

  it('the Playwright server (a production build with E2E=1) reaches the states', async () => {
    const env = await envWith({ NODE_ENV: 'production', E2E: '1' });
    expect(resolveDevState({ state: 'mismatch' }, env)).toBe('mismatch');
  });
});

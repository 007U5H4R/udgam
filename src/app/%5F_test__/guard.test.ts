import { afterEach, describe, expect, it, vi } from 'vitest';

// technical-plan §1: test-only surfaces 404 unless E2E=1 (a production server never sets it).
describe('requireTestSurface', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(e2e: string | undefined) {
    vi.resetModules();
    if (e2e !== undefined) vi.stubEnv('E2E', e2e);
    return (await import('./guard')).requireTestSurface;
  }

  it('answers 404 when E2E is unset', async () => {
    const guard = await load(undefined);
    expect(guard).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  });

  it('answers 404 when E2E=0', async () => {
    const guard = await load('0');
    expect(guard).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  });

  it('allows the page when E2E=1', async () => {
    const guard = await load('1');
    expect(guard).not.toThrow();
  });

  it('the crypto page calls the guard before rendering', async () => {
    vi.resetModules();
    const page = (await import('./crypto/page')).default;
    expect(() => page()).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  });
});

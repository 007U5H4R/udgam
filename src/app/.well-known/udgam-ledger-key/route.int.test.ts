// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TC-064 (route half): GET /.well-known/udgam-ledger-key publishes the public JWK only.
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udgam-wk-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('GET /.well-known/udgam-ledger-key (TC-064)', () => {
  it('returns 200 JSON with one public key, no private member, cacheable for 5 minutes', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await res.json()) as { keys: Record<string, unknown>[] };
    expect(body.keys).toHaveLength(1);
    const [k] = body.keys;
    expect(Object.keys(k!).sort()).toEqual(['alg', 'crv', 'kid', 'kty', 'use', 'x', 'y']);
    expect(k).toMatchObject({ kty: 'EC', crv: 'P-256', use: 'sig', alg: 'ES256' });
    expect(k).not.toHaveProperty('d');
  });

  it('serves the same kid the ledger signs with', async () => {
    const { GET } = await import('./route');
    const { loadLedgerKey } = await import('../../../lib/ledger/keys');
    const body = (await (await GET()).json()) as { keys: { kid: string }[] };
    expect(body.keys[0]!.kid).toBe((await loadLedgerKey()).kid);
  });

  it('answers 503 without detail when the key cannot be loaded', async () => {
    // The key's parent "directory" is a regular file, so the key can be neither read nor created.
    await writeFile(join(dir, 'not-a-dir'), 'x');
    vi.stubEnv('LEDGER_KEY_PATH', join(dir, 'not-a-dir', 'ledger.jwk'));
    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

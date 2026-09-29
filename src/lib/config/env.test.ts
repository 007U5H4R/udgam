import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('returns the documented defaults for an empty source', () => {
    const env = loadEnv({});
    expect(env.DATA_DIR).toBe('./data');
    expect(env.DATABASE_URL).toBe('file:./data/udgam.db');
    expect(env.REMOTE_SENSING_PROVIDER).toBe('fixture');
    expect(env.MAP_TILE_PROVIDER).toBe('esri');
    expect(env.LEDGER_ADAPTER).toBe('hashchain');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.LEDGER_KEY_PATH).toBe('./data/keys/ledger.jwk');
    expect(env.DEMO_MODE).toBe('0');
  });

  it('derives the database and key paths from DATA_DIR when they are not set', () => {
    const env = loadEnv({ DATA_DIR: '.e2e-data' });
    expect(env.DATABASE_URL).toBe('file:.e2e-data/udgam.db');
    expect(env.LEDGER_KEY_PATH).toBe('.e2e-data/keys/ledger.jwk');
  });

  it('lets explicit values win over derived ones', () => {
    const env = loadEnv({ DATA_DIR: 'x', DATABASE_URL: 'file:/tmp/a.db', LEDGER_KEY_PATH: '/k/l.jwk' });
    expect(env.DATABASE_URL).toBe('file:/tmp/a.db');
    expect(env.LEDGER_KEY_PATH).toBe('/k/l.jwk');
  });

  it('treats empty strings (from a copied .env.example) as unset', () => {
    const env = loadEnv({ DATA_DIR: '', GFW_API_KEY: '', REMOTE_SENSING_PROVIDER: '' });
    expect(env.DATA_DIR).toBe('./data');
    expect(env.GFW_API_KEY).toBeUndefined();
    expect(env.REMOTE_SENSING_PROVIDER).toBe('fixture');
  });

  it('requires the provider keys when the live provider is selected, naming variables only', () => {
    let message = '';
    try {
      loadEnv({ REMOTE_SENSING_PROVIDER: 'live' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('GFW_API_KEY');
    expect(message).toContain('CDSE_CLIENT_ID');
    expect(message).toContain('CDSE_CLIENT_SECRET');
  });

  it('accepts the live provider when all keys are present', () => {
    const env = loadEnv({
      REMOTE_SENSING_PROVIDER: 'live',
      GFW_API_KEY: 'a',
      CDSE_CLIENT_ID: 'b',
      CDSE_CLIENT_SECRET: 'c',
    });
    expect(env.REMOTE_SENSING_PROVIDER).toBe('live');
  });

  it('requires BETTER_AUTH_SECRET in production only', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/);
    expect(loadEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32) }).NODE_ENV).toBe('production');
    expect(() => loadEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('never puts values in error messages', () => {
    const secret = 'canary-'.repeat(6); // low-entropy on purpose: not scan bait
    for (const src of [
      { REMOTE_SENSING_PROVIDER: 'live', GFW_API_KEY: secret },
      { LOG_LEVEL: secret, BETTER_AUTH_SECRET: secret },
      { MAP_TILE_PROVIDER: secret, ARCGIS_API_KEY: secret },
      { NODE_ENV: 'production', DATABASE_URL: secret },
    ]) {
      let message = '';
      try {
        loadEnv(src);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(secret);
    }
  });
});

describe('.env.example', () => {
  const lines = readFileSync('.env.example', 'utf8').split('\n');
  const assignments = lines.filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));

  it('lists exactly the section 17 names', () => {
    expect(assignments.map((l) => l.split('=')[0])).toEqual([
      'DATABASE_URL',
      'DATA_DIR',
      'LEDGER_KEY_PATH',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'PUBLIC_BASE_URL',
      'REMOTE_SENSING_PROVIDER',
      'GFW_API_KEY',
      'CDSE_CLIENT_ID',
      'CDSE_CLIENT_SECRET',
      'MAP_TILE_PROVIDER',
      'ARCGIS_API_KEY',
      'MAPTILER_KEY',
      'LEDGER_ADAPTER',
      'ANVIL_RPC_URL',
      'EVM_OPERATOR_KEY_PATH',
      'LOG_LEVEL',
      'DEMO_MODE',
    ]);
  });

  it('carries values only for the three non-secret defaults', () => {
    const withValues = assignments.filter((l) => l.split('=')[1] !== '');
    expect(withValues.sort()).toEqual([
      'LEDGER_ADAPTER=hashchain',
      'MAP_TILE_PROVIDER=esri',
      'REMOTE_SENSING_PROVIDER=fixture',
    ]);
  });

  it('starts with the never-commit-real-values warning', () => {
    expect(lines[0]).toMatch(/^# Never commit real values/);
  });
});

describe('browser guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws at import when a window exists', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    await expect(import('./env')).rejects.toThrow(/browser/);
  });
});

describe('env proxy', () => {
  const canary = 'canary-'.repeat(6); // low-entropy on purpose: not scan bait

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    vi.stubEnv('GFW_API_KEY', canary);
    vi.stubEnv('BETTER_AUTH_SECRET', canary);
    return (await import('./env')).env;
  }

  it('reads validated values', async () => {
    const env = await load();
    expect(env.GFW_API_KEY).toBe(canary);
    expect(env.DATA_DIR).toBe('./data');
  });

  it('is read-only with a clear error', async () => {
    const env = await load();
    expect(() => {
      (env as { LOG_LEVEL: string }).LOG_LEVEL = 'debug';
    }).toThrow(/env is read-only/);
    expect(() => {
      delete (env as { LOG_LEVEL?: string }).LOG_LEVEL;
    }).toThrow(/env is read-only/);
    expect(() => Object.defineProperty(env, 'X', { value: 1 })).toThrow(/env is read-only/);
    expect(env.LOG_LEVEL).toBe('info'); // reads still work after the failed writes
  });

  it('never reveals values through JSON.stringify, spread or key enumeration', async () => {
    const env = await load();
    expect(JSON.stringify(env)).not.toContain(canary);
    expect(JSON.stringify(env)).toContain('GFW_API_KEY'); // names only
    expect(JSON.stringify({ ...env })).not.toContain(canary);
    expect(Object.keys(env)).toEqual([]);
    expect(Object.values(env)).toEqual([]);
    expect(JSON.stringify({ nested: env })).not.toContain(canary);
  });
});

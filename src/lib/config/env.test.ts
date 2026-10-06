import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAPTURE_BUDGET } from '../capture/budget-defaults';
import { loadEnv } from './env';

/** Placeholder live-provider keys (not real values). */
const LIVE_KEYS = { REMOTE_SENSING_PROVIDER: 'live', GFW_API_KEY: 'a', CDSE_CLIENT_ID: 'b', CDSE_CLIENT_SECRET: 'c' } as const;
/** The deployment's public origin, https in production (DES-219). */
const HTTPS_URLS = { PUBLIC_BASE_URL: 'https://udgam.example', BETTER_AUTH_URL: 'https://udgam.example' } as const;

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
    expect(loadEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), ...LIVE_KEYS, ...HTTPS_URLS }).NODE_ENV).toBe('production');
    expect(() => loadEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  describe('the fixture provider never runs in production (EXE12, CF-11)', () => {
    const PROD = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), ...HTTPS_URLS } as const;
    const message = (src: Record<string, string>) => {
      try {
        loadEnv(src);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };

    it('production + fixture refuses to start, naming REMOTE_SENSING_PROVIDER and the rule', () => {
      expect(message({ ...PROD, REMOTE_SENSING_PROVIDER: 'fixture' })).toBe(
        'Invalid environment configuration. REMOTE_SENSING_PROVIDER: must be live when NODE_ENV=production (fixture only with E2E=1)',
      );
      expect(message({ ...PROD })).toContain('REMOTE_SENSING_PROVIDER: must be live when NODE_ENV=production'); // fixture is the default
    });

    it('DEMO_MODE=1 is not an exception', () => {
      expect(message({ ...PROD, REMOTE_SENSING_PROVIDER: 'fixture', DEMO_MODE: '1' })).toContain('REMOTE_SENSING_PROVIDER');
    });

    it('production + fixture + E2E=1 (the Playwright server) is allowed', () => {
      expect(loadEnv({ ...PROD, REMOTE_SENSING_PROVIDER: 'fixture', E2E: '1' }).REMOTE_SENSING_PROVIDER).toBe('fixture');
    });

    it('production + live with its keys is allowed', () => {
      expect(loadEnv({ ...PROD, ...LIVE_KEYS, ...HTTPS_URLS }).REMOTE_SENSING_PROVIDER).toBe('live');
    });

    it('development and test run the fixture provider', () => {
      expect(loadEnv({ NODE_ENV: 'development', REMOTE_SENSING_PROVIDER: 'fixture' }).REMOTE_SENSING_PROVIDER).toBe('fixture');
      expect(loadEnv({ NODE_ENV: 'test' }).REMOTE_SENSING_PROVIDER).toBe('fixture');
    });
  });

  describe('the public URLs are absolute https in production (DES-219, QA-P6-8-3)', () => {
    const PROD = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), ...LIVE_KEYS } as const;
    const message = (src: Record<string, string>) => {
      try {
        loadEnv(src);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };
    const RULE = 'must be an absolute https:// URL when NODE_ENV=production (http only with E2E=1)';

    it('production with both set to https URLs starts', () => {
      const e = loadEnv({ ...PROD, ...HTTPS_URLS });
      expect([e.PUBLIC_BASE_URL, e.BETTER_AUTH_URL]).toEqual(['https://udgam.example', 'https://udgam.example']);
      expect(loadEnv({ ...PROD, PUBLIC_BASE_URL: 'https://udgam.example/', BETTER_AUTH_URL: 'https://udgam.example:8443' }).PUBLIC_BASE_URL).toBe('https://udgam.example/');
    });

    it('production refuses an unset PUBLIC_BASE_URL (no silent localhost fallback) and an unset BETTER_AUTH_URL', () => {
      expect(message({ ...PROD, BETTER_AUTH_URL: 'https://udgam.example' })).toBe(`Invalid environment configuration. PUBLIC_BASE_URL: ${RULE}`);
      expect(message({ ...PROD, PUBLIC_BASE_URL: 'https://udgam.example' })).toBe(`Invalid environment configuration. BETTER_AUTH_URL: ${RULE}`);
    });

    it('production refuses http, relative, schemeless, other-scheme and credentialed URLs, naming the variable only', () => {
      for (const bad of ['http://udgam.example', 'udgam.example', '/verify', 'https://', 'ftp://udgam.example', 'https://user:pw@udgam.example', 'HTTP://localhost:3000']) {
        const m = message({ ...PROD, PUBLIC_BASE_URL: bad, BETTER_AUTH_URL: bad });
        expect(m, bad).toContain(`PUBLIC_BASE_URL: ${RULE}`);
        expect(m, bad).toContain(`BETTER_AUTH_URL: ${RULE}`);
        expect(m, bad).not.toMatch(/udgam\.example|localhost|user:pw|\/verify/); // names, never values
      }
    });

    it('the Playwright production build (E2E=1) may use http://localhost, by the testSurfacesOn rule (SEC-007)', () => {
      const e = loadEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), REMOTE_SENSING_PROVIDER: 'fixture', E2E: '1', BETTER_AUTH_URL: 'http://localhost:3100' });
      expect(e.PUBLIC_BASE_URL).toBe('http://localhost:3000');
    });

    it('development and test keep the localhost default', () => {
      expect(loadEnv({ NODE_ENV: 'development' }).PUBLIC_BASE_URL).toBe('http://localhost:3000');
      expect(loadEnv({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'http://127.0.0.1:4000' }).PUBLIC_BASE_URL).toBe('http://127.0.0.1:4000');
    });
  });

  it('E2E_FIXTURE_DELAY_MS (test-only) is an optional whole number of ms, 0 or more', () => {
    expect(loadEnv({}).E2E_FIXTURE_DELAY_MS).toBeUndefined();
    expect(loadEnv({ E2E_FIXTURE_DELAY_MS: '2000' }).E2E_FIXTURE_DELAY_MS).toBe(2000);
    expect(() => loadEnv({ E2E_FIXTURE_DELAY_MS: '-1' })).toThrow(/E2E_FIXTURE_DELAY_MS/);
    expect(() => loadEnv({ E2E_FIXTURE_DELAY_MS: 'soon' })).toThrow(/E2E_FIXTURE_DELAY_MS/);
    expect(() => loadEnv({ E2E_FIXTURE_DELAY_MS: '1.5' })).toThrow(/E2E_FIXTURE_DELAY_MS/);
  });

  it('capture budget and disk threshold (SEC-003): conservative defaults, positive whole numbers when set', () => {
    const d = loadEnv({});
    expect(d.CAPTURE_DAILY_MAX_CAPTURES).toBe(100);
    expect(d.CAPTURE_DAILY_MAX_BYTES).toBe(100 * 3 * 4 * 1024 * 1024); // EV9: 3 photos × 4 MB placeholder
    expect({ maxCaptures: d.CAPTURE_DAILY_MAX_CAPTURES, maxBytes: d.CAPTURE_DAILY_MAX_BYTES }).toEqual(DEFAULT_CAPTURE_BUDGET); // one source, no drift
    expect(d.HEALTH_MIN_FREE_DISK_BYTES).toBe(10 * 1024 ** 3);
    const set = loadEnv({ CAPTURE_DAILY_MAX_CAPTURES: '40', CAPTURE_DAILY_MAX_BYTES: '500000000', HEALTH_MIN_FREE_DISK_BYTES: '0' });
    expect([set.CAPTURE_DAILY_MAX_CAPTURES, set.CAPTURE_DAILY_MAX_BYTES, set.HEALTH_MIN_FREE_DISK_BYTES]).toEqual([40, 500000000, 0]);
    for (const [name, bad] of [
      ['CAPTURE_DAILY_MAX_CAPTURES', '0'],
      ['CAPTURE_DAILY_MAX_CAPTURES', '1.5'],
      ['CAPTURE_DAILY_MAX_BYTES', '-1'],
      ['CAPTURE_DAILY_MAX_BYTES', 'lots'],
      ['HEALTH_MIN_FREE_DISK_BYTES', '-5'],
    ] as const) {
      expect(() => loadEnv({ [name]: bad }), `${name}=${bad}`).toThrow(new RegExp(name));
    }
  });

  it('LEDGER_CHECKPOINT_INTERVAL_SEC (EXE54): 1 h by default, a positive whole number of seconds when set', () => {
    expect(loadEnv({}).LEDGER_CHECKPOINT_INTERVAL_SEC).toBe(3600);
    expect(loadEnv({ LEDGER_CHECKPOINT_INTERVAL_SEC: '900' }).LEDGER_CHECKPOINT_INTERVAL_SEC).toBe(900);
    for (const bad of ['0', '-1', '1.5', 'hourly']) expect(() => loadEnv({ LEDGER_CHECKPOINT_INTERVAL_SEC: bad }), bad).toThrow(/LEDGER_CHECKPOINT_INTERVAL_SEC/);
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

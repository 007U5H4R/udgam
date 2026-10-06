import { z } from 'zod';
import { realDeployment } from './deployment';

// Secrets and configuration are read only through this module (technical-plan §1, N6/S11).
// It must never be bundled for the browser, and src/lib may not import `server-only` (no Next
// packages in lib), so the guard is a runtime check.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/config/env.ts must not be imported in the browser');
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const base = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATA_DIR: z.string().min(1).default('./data'),
  DATABASE_URL: z.string().min(1).optional(),
  LEDGER_KEY_PATH: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().min(1).default('http://localhost:3000'),
  REMOTE_SENSING_PROVIDER: z.enum(['fixture', 'live']).default('fixture'),
  GFW_API_KEY: z.string().min(1).optional(),
  CDSE_CLIENT_ID: z.string().min(1).optional(),
  CDSE_CLIENT_SECRET: z.string().min(1).optional(),
  MAP_TILE_PROVIDER: z.enum(['esri', 'maptiler']).default('esri'),
  ARCGIS_API_KEY: z.string().min(1).optional(),
  MAPTILER_KEY: z.string().min(1).optional(),
  LEDGER_ADAPTER: z.enum(['hashchain', 'evm']).default('hashchain'),
  ANVIL_RPC_URL: z.string().min(1).optional(),
  EVM_OPERATOR_KEY_PATH: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DEMO_MODE: z.enum(['0', '1']).default('0'),
  // SEC-003 (TKT-28): each agent's daily budget of accepted captures and of their photo bytes
  // (src/lib/capture/budget.ts). Defaults sized from EV9's 3 × 4 MB placeholder: 100 captures, 1.2 GiB.
  CAPTURE_DAILY_MAX_CAPTURES: z.coerce.number().int().positive().default(100),
  CAPTURE_DAILY_MAX_BYTES: z.coerce.number().int().positive().default(100 * 3 * 4 * 1024 * 1024),
  // SEC-003: /api/health reports disk:"low" below this many free bytes on DATA_DIR's filesystem (10 GiB:
  // over a day of every pilot agent at the full budget). 0 turns the check's threshold off.
  HEALTH_MIN_FREE_DISK_BYTES: z.coerce.number().int().nonnegative().default(10 * 1024 ** 3),
  // EXE54 (TKT-28): in a real deployment a background timer seals unsealed ledger entries this often
  // (src/lib/ledger/checkpoint-timer.ts), so a quiet day never leaves entries unsealed.
  LEDGER_CHECKPOINT_INTERVAL_SEC: z.coerce.number().int().positive().default(3600),
  // Test-only surfaces (/__test__/*) exist only when E2E=1 (technical-plan §1). Set by the Playwright
  // webServer; never set in production, so it is not listed in .env.example.
  E2E: z.enum(['0', '1']).default('0'),
  // Test-only (TSK-10.10): with E2E=1, the fixture provider's NDVI calls answer this many ms late, so
  // the e2e sees the satellite groups tick after the local ones. Set by the Playwright webServer only;
  // ignored without E2E=1 and never applied to the live provider. Not in .env.example (§17 pins it).
  E2E_FIXTURE_DELAY_MS: z.coerce.number().int().nonnegative().optional(),
  // Password for the seeded demo accounts (scripts/seed-accounts.ts, TKT-04). A seed-time input only,
  // so not in .env.example (§17 pins that list); outside production the seed has a demo default.
  SEED_PASSWORD: z.string().min(8).optional(),
});

/** Every variable the schema reads (deploy/app.env.example accounts for each, TSK-28.1). */
export const ENV_VARIABLE_NAMES: readonly string[] = Object.keys(base.shape);
const VARIABLE_NAMES = ENV_VARIABLE_NAMES;

/** An absolute https:// URL with a host and no user or password in it (DES-219). */
function absoluteHttps(v: string | undefined): boolean {
  if (v === undefined) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname !== '' && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}

const schema = base
  .superRefine((v, ctx) => {
    if (v.REMOTE_SENSING_PROVIDER === 'live') {
      for (const name of ['GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET'] as const) {
        if (!v[name]) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'required when REMOTE_SENSING_PROVIDER=live',
          });
        }
      }
    }
    if (v.NODE_ENV === 'production' && !v.BETTER_AUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'required when NODE_ENV=production',
      });
    }
    // EXE12 (CF-11): fixture satellite answers must never reach a real deployment. The one exception is
    // E2E=1 — the Playwright server (`next build && next start`, so NODE_ENV=production), which also
    // exposes the test-only routes and so is never set in a real deployment. DEMO_MODE is no exception.
    if (v.NODE_ENV === 'production' && v.REMOTE_SENSING_PROVIDER === 'fixture' && v.E2E !== '1') {
      ctx.addIssue({
        code: 'custom',
        path: ['REMOTE_SENSING_PROVIDER'],
        message: 'must be live when NODE_ENV=production (fixture only with E2E=1)',
      });
    }
    // DES-219 (QA-P6-8-3): QR codes, link previews, canonical URLs, GeoJSON certificate links and Better
    // Auth's origin check are built from these. In a real deployment both are required and https: no
    // silent http://localhost:3000 fallback. Same exception as the test surfaces and HSTS (SEC-007):
    // the Playwright production build (E2E=1) runs on http://localhost.
    if (realDeployment(v)) {
      for (const name of ['PUBLIC_BASE_URL', 'BETTER_AUTH_URL'] as const) {
        // An unset PUBLIC_BASE_URL has its http://localhost default here, which fails the rule too.
        if (!absoluteHttps(v[name])) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'must be an absolute https:// URL when NODE_ENV=production (http only with E2E=1)' });
        }
      }
    }
  })
  .transform((v) => ({
    ...v,
    DATABASE_URL: v.DATABASE_URL ?? `file:${v.DATA_DIR}/udgam.db`,
    LEDGER_KEY_PATH: v.LEDGER_KEY_PATH ?? `${v.DATA_DIR}/keys/ledger.jwk`,
  }));

export type Env = Readonly<z.output<typeof schema>>;

/**
 * Validate a variable source. Empty strings count as unset (a copied `.env.example` has `NAME=`).
 * Errors name variables and rule codes only, never values.
 */
export function loadEnv(src: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) if (v !== undefined && v !== '') cleaned[k] = v;
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;
  const problems = result.error.issues.map((i) => {
    const name = i.path.join('.') || '(env)';
    return `${name}: ${i.code === 'custom' ? i.message : i.code}`;
  });
  throw new Error(`Invalid environment configuration. ${problems.join('; ')}`);
}

let cached: Env | undefined;
const readOnly = (): never => {
  throw new Error('env is read-only');
};

/**
 * Parsed once, on first access, so `next build` (which imports route modules with
 * NODE_ENV=production and no secrets) does not fail. Any property read validates.
 *
 * The proxy is deliberately not enumerable: `Object.keys(env)`, `{ ...env }` and JSON.stringify
 * never reveal values (`toJSON` returns the variable names only), so `log.info({ env })` cannot leak a
 * secret. It is also read-only.
 */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop) {
    if (prop === 'toJSON') return () => VARIABLE_NAMES;
    cached ??= loadEnv(process.env);
    return cached[prop as keyof Env];
  },
  has(_t, prop) {
    cached ??= loadEnv(process.env);
    return prop in cached;
  },
  set: readOnly,
  defineProperty: readOnly,
  deleteProperty: readOnly,
});

import { z } from 'zod';

// Secrets and configuration are read only through this module (technical-plan §1, N6/S11).
// It must never be bundled for the browser, and src/lib may not import `server-only` (no Next
// packages in lib), so the guard is a runtime check.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/config/env.ts must not be imported in the browser');
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const schema = z
  .object({
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
  })
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
  })
  .transform((v) => ({
    ...v,
    DATABASE_URL: v.DATABASE_URL ?? `file:${v.DATA_DIR}/udgam.db`,
    LEDGER_KEY_PATH: v.LEDGER_KEY_PATH ?? `${v.DATA_DIR}/keys/ledger.jwk`,
  }));

export type Env = z.output<typeof schema>;

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

/**
 * Parsed once, on first access, so `next build` (which imports route modules with
 * NODE_ENV=production and no secrets) does not fail. Any property read validates.
 */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop) {
    cached ??= loadEnv(process.env);
    return cached[prop as keyof Env];
  },
  has(_t, prop) {
    cached ??= loadEnv(process.env);
    return prop in cached;
  },
  ownKeys() {
    cached ??= loadEnv(process.env);
    return Reflect.ownKeys(cached);
  },
  getOwnPropertyDescriptor(_t, prop) {
    cached ??= loadEnv(process.env);
    const d = Object.getOwnPropertyDescriptor(cached, prop);
    return d ? { ...d, configurable: true } : undefined;
  },
});

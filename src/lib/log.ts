import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { env } from './config/env';
import { SECRET_ENV_NAMES } from './config/secret-names';

/** The secret environment variables (.env.example): redacted wherever one is logged by name (TSK-19.6). */
const SECRET_ENV: readonly string[] = SECRET_ENV_NAMES;

// technical-plan §15: JSON to stdout; secrets and signatures never logged. pino's default censor
// ("[Redacted]") is kept. Wildcards match one level, so header paths are listed explicitly.
const REDACT = [
  ...SECRET_ENV,
  ...SECRET_ENV.map((k) => `*.${k}`),
  'secret',
  'key',
  'authorization',
  'cookie',
  'signature',
  'password',
  '*.authorization',
  '*.cookie',
  '*.signature',
  '*.password',
  '*.secret',
  '*.key',
  'headers.authorization',
  'headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.req.headers.authorization',
  '*.req.headers.cookie',
];

export function createLogger(level: string, destination?: pino.DestinationStream): pino.Logger {
  return pino({ level, redact: { paths: REDACT } }, destination);
}

let instance: pino.Logger | undefined;

function build(): pino.Logger {
  if (!instance) {
    let level = 'info';
    try {
      level = env.LOG_LEVEL;
    } catch {
      // An invalid environment must not stop the logger: it is what reports that very problem
      // (for example the health route's config failure). Fall back to info.
    }
    instance = createLogger(level);
  }
  return instance;
}

/**
 * The shared logger. Created on first use so importing it never validates the environment
 * (a production `next build` runs without runtime secrets). Reads and writes (`log.level = 'debug'`)
 * are forwarded to the real logger.
 */
export const log: pino.Logger = new Proxy({} as pino.Logger, {
  get(_t, prop) {
    const l = build();
    const v = Reflect.get(l, prop, l) as unknown;
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(l) : v;
  },
  set(_t, prop, value) {
    const l = build();
    return Reflect.set(l, prop, value, l);
  },
});

/** A child logger carrying a request id (from `x-request-id` or generated). */
export function withRequestId(id?: string): pino.Logger {
  return build().child({ requestId: id && id.length > 0 ? id : randomUUID() });
}

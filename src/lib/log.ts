import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { env } from './config/env';

// technical-plan §15: JSON to stdout; secrets and signatures never logged.
const REDACT = [
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
];

let instance: pino.Logger | undefined;

function build(): pino.Logger {
  instance ??= pino({ level: env.LOG_LEVEL, redact: { paths: REDACT, censor: '[redacted]' } });
  return instance;
}

/**
 * The shared logger. Created on first use so importing it never validates the environment
 * (a production `next build` runs without runtime secrets).
 */
export const log: pino.Logger = new Proxy({} as pino.Logger, {
  get(_t, prop) {
    const l = build();
    const v = Reflect.get(l, prop, l) as unknown;
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(l) : v;
  },
});

/** A child logger carrying a request id (from `x-request-id` or generated). */
export function withRequestId(id?: string): pino.Logger {
  return build().child({ requestId: id && id.length > 0 ? id : randomUUID() });
}

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type InValue } from '@libsql/client';

// Test helpers for the TKT-02 tracer e2e. The web server (playwright.config.ts) runs with
// DATA_DIR=.e2e-data; these seed and read that same database.
export const E2E_DATA_DIR = '.e2e-data';

export type TracerKey = {
  deviceId: string;
  plotId: string;
  producerId: string;
  publicJwk: JsonWebKey;
  testOnlyPrivateJwk: JsonWebKey;
  agentEmail: string;
  testOnlyAgentPassword: string;
};

/** Seed a fresh tracer world (new random IDs) and return its test key file, then delete the file. */
export function seedTracer(): TracerKey {
  const out = join(E2E_DATA_DIR, `tracer-key-${randomUUID()}.json`);
  const env: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  execFileSync('./node_modules/.bin/tsx', ['scripts/seed-tracer.ts', '--out', out], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    return JSON.parse(readFileSync(out, 'utf8')) as TracerKey;
  } finally {
    rmSync(out, { force: true });
  }
}

/** Read-only queries against the e2e database. */
export async function query<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const client = createClient({ url: `file:${join(E2E_DATA_DIR, 'udgam.db')}` });
  try {
    return (await client.execute({ sql, args })).rows as unknown as T[];
  } finally {
    client.close();
  }
}

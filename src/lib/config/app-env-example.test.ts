import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENV_VARIABLE_NAMES } from './env';
import { SECRET_ENV_NAMES } from './secret-names';

// TSK-28.1 (TKT-28): deploy/app.env.example is the template the owner copies to /etc/udgam/app.env on
// the instance. Names only, never a value. It mirrors .env.example, adds UDGAM_DOMAIN (Caddy, Compose)
// and the SEC-003 budget variables, and accounts for EVERY variable env.ts reads: each one is either a
// `NAME=` line or named on a `# NOT SET IN PRODUCTION:` line saying why it stays out.

const lines = readFileSync('deploy/app.env.example', 'utf8').split('\n');
const assigned = lines.filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));
const names = assigned.map((l) => l.split('=')[0]!);
/** `# NOT SET IN PRODUCTION: A, B (why)`: the names before the parenthesis. */
const notSet = lines
  .filter((l) => l.startsWith('# NOT SET IN PRODUCTION:'))
  .flatMap((l) => l.slice('# NOT SET IN PRODUCTION:'.length).split('(')[0]!.split(','))
  .map((n) => n.trim())
  .filter((n) => n !== '');
const envExample = readFileSync('.env.example', 'utf8')
  .split('\n')
  .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
  .map((l) => l.split('=')[0]!);

describe('deploy/app.env.example (TSK-28.1)', () => {
  it('starts with the never-commit-values warning', () => {
    expect(lines[0]).toMatch(/^# Never commit real values/);
  });

  it('carries names only: every assignment is empty', () => {
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.filter((l) => !/^[A-Z][A-Z0-9_]*=$/.test(l))).toEqual([]);
  });

  it('accounts for every variable the env schema reads, each exactly once', () => {
    const accounted = [...names, ...notSet];
    for (const n of ENV_VARIABLE_NAMES) expect(accounted, n).toContain(n);
    expect(new Set(accounted).size).toBe(accounted.length);
  });

  it('names nothing the schema does not read, except UDGAM_DOMAIN', () => {
    expect([...names, ...notSet].filter((n) => !ENV_VARIABLE_NAMES.includes(n))).toEqual(['UDGAM_DOMAIN']);
  });

  it('mirrors .env.example, adds UDGAM_DOMAIN and the SEC-003 budget variables, and lists every secret', () => {
    for (const n of envExample) expect(names, n).toContain(n);
    for (const n of ['UDGAM_DOMAIN', 'CAPTURE_DAILY_MAX_CAPTURES', 'CAPTURE_DAILY_MAX_BYTES', 'HEALTH_MIN_FREE_DISK_BYTES']) expect(names, n).toContain(n);
    for (const n of SECRET_ENV_NAMES) expect(names, n).toContain(n);
  });

  it('keeps the test-only and seed variables out of production', () => {
    for (const n of ['E2E', 'E2E_FIXTURE_DELAY_MS', 'SEED_PASSWORD', 'NODE_ENV']) {
      expect(names, n).not.toContain(n);
      expect(notSet, n).toContain(n);
    }
  });
});

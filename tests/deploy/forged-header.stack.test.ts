import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { describe, expect, it } from 'vitest';
import { IP_FAILURES } from '../../src/lib/auth/sign-in-limit';
import { TELEMETRY_IP_LIMIT } from '../../src/lib/certificate/telemetry';

// TSK-27.3, EXE14, SEC-006: behind Caddy, a client cannot pick its own rate-limit bucket. Every request
// below forges a different X-Forwarded-For and X-Real-IP, yet they all land in the one per-address
// bucket of the address Caddy saw, so the per-IP limits trip at their configured counts:
//   - sign-in (the Server Action, IP_FAILURES: 30 failures per address per 15 min; each attempt uses a
//     new email, so only the per-address limit can trip);
//   - the certificate beacon /api/telemetry (TELEMETRY_IP_LIMIT: 30 per address per 10 min), a route
//     handler keyed by the same clientIp() as capture and enrolment.
// And no throttle row is ever keyed by a forged address (read from the app container's database).
//
// It needs the Compose stack, so plain `pnpm test` skips it. Run it with:
//   UDGAM_STACK_DIR=<dir> tests/deploy/stack/stack.sh up
//   UDGAM_STACK_URL=https://localhost:4711 UDGAM_STACK_CA=<dir>/caddy-root.crt \
//     pnpm vitest run tests/deploy/forged-header.stack.test.ts
// A bucket fills for its whole window, so run it on a fresh stack (stack.sh down, then up).
// UDGAM_STACK_URL may also be plain http (the app reached directly, which EXE14 forbids: there the test
// fails, as it must). UDGAM_STACK_APP_CONTAINER names the app container (default udgam-local-app-1).

const BASE = process.env.UDGAM_STACK_URL;
const CA = process.env.UDGAM_STACK_CA;
const APP_CONTAINER = process.env.UDGAM_STACK_APP_CONTAINER ?? 'udgam-local-app-1';

type Res = { status: number; body: string };

function send(path: string, opts: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<Res> {
  const url = new URL(path, BASE);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: opts.method ?? 'GET',
        ca: CA ? readFileSync(CA) : undefined,
        headers: { ...(opts.body ? { 'content-length': String(opts.body.length) } : {}), ...opts.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(opts.body);
  });
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The sign-in form's hidden Server Action fields, as a browser without JavaScript would post them. */
async function signInFields(): Promise<[string, string][]> {
  const page = await send('/sign-in');
  expect(page.status).toBe(200);
  const fields: [string, string][] = [];
  for (const m of page.body.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) fields.push([unescape(m[1]!), unescape(m[2] ?? '')]);
  expect(fields.some(([n]) => n.startsWith('$ACTION_'))).toBe(true);
  return fields;
}

function multipart(fields: [string, string][]): { body: Buffer; type: string } {
  const boundary = `----udgam${randomUUID().replace(/-/g, '')}`;
  const parts = fields.map(([n, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
  return { body: Buffer.from(`${parts.join('')}--${boundary}--\r\n`), type: `multipart/form-data; boundary=${boundary}` };
}

const forged = (i: number) => ({ 'x-forwarded-for': `198.51.100.${i}`, 'x-real-ip': `203.0.113.${i}` });

/** Rate-limit keys in the app's database that name one of the forged addresses. */
function forgedKeys(): string[] {
  const script = `
    const { createClient } = require('@libsql/client');
    const db = createClient({ url: 'file:/data/udgam.db' });
    db.execute("SELECT DISTINCT key FROM rate_limits WHERE key LIKE '%198.51.100.%' OR key LIKE '%203.0.113.%'")
      .then((r) => { console.log(JSON.stringify(r.rows.map((x) => x.key))); db.close(); });`;
  return JSON.parse(execFileSync('docker', ['exec', '-w', '/app', APP_CONTAINER, 'node', '-e', script], { encoding: 'utf8' })) as string[];
}

/** Seconds left in the current window of `windowSec`: a run must not straddle a window boundary. */
const leftInWindow = (windowSec: number) => windowSec - (Math.floor(Date.now() / 1000) % windowSec);

describe.skipIf(!BASE)('behind Caddy, forged X-Forwarded-For / X-Real-IP share one per-IP bucket (EXE14, SEC-006)', () => {
  it(`sign-in: ${IP_FAILURES.limit + 1} attempts from "${IP_FAILURES.limit + 1} addresses" trip the per-IP limit at ${IP_FAILURES.limit}`, async () => {
    expect(leftInWindow(IP_FAILURES.windowSec)).toBeGreaterThan(90);
    const hidden = await signInFields();
    const outcomes: string[] = [];
    for (let i = 1; i <= IP_FAILURES.limit + 1; i++) {
      const { body, type } = multipart([...hidden, ['email', `forged-${i}-${randomUUID()}@example.invalid`], ['password', 'not-the-password']]);
      const res = await send('/sign-in', { method: 'POST', body, headers: { 'content-type': type, origin: BASE!, ...forged(i) } });
      expect(res.status).toBe(200);
      const message = unescape(/id="sign-in-error"[^>]*>([^<]*)</.exec(res.body)?.[1] ?? '');
      outcomes.push(message.startsWith('Email or password') ? 'credentials' : message.startsWith("Couldn't sign in") ? 'throttled' : `other:${message}`);
    }
    // A fresh stack answers exactly `limit` credential checks; a re-run in the same window fewer.
    const seen = JSON.stringify(outcomes);
    const checked = outcomes.filter((o) => o === 'credentials').length;
    expect(outcomes.every((o) => o === 'credentials' || o === 'throttled'), seen).toBe(true);
    expect(checked, seen).toBeLessThanOrEqual(IP_FAILURES.limit);
    expect(outcomes.at(-1), seen).toBe('throttled');
    expect(outcomes.slice(outcomes.indexOf('throttled')).every((o) => o === 'throttled'), seen).toBe(true);
  }, 120_000);

  it(`/api/telemetry: the per-IP beacon limit (${TELEMETRY_IP_LIMIT.limit}) trips the same way`, async () => {
    expect(leftInWindow(TELEMETRY_IP_LIMIT.windowSec)).toBeGreaterThan(60);
    const statuses: number[] = [];
    for (let i = 1; i <= TELEMETRY_IP_LIMIT.limit + 1; i++) {
      // Not a valid beacon: the limit is counted before the body is read, so each one costs a slot (400).
      const res = await send('/api/telemetry', { method: 'POST', body: Buffer.from('{}'), headers: { 'content-type': 'application/json', ...forged(i) } });
      statuses.push(res.status);
    }
    const seen = JSON.stringify(statuses);
    expect(statuses.every((s) => s === 400 || s === 429), seen).toBe(true);
    expect(statuses.filter((s) => s === 400).length, seen).toBeLessThanOrEqual(TELEMETRY_IP_LIMIT.limit);
    expect(statuses.at(-1), seen).toBe(429);
  }, 120_000);

  it('no throttle row is keyed by a forged address', () => {
    expect(forgedKeys()).toEqual([]);
  });
});

// Fix round 1, Q9 (SEC-005): the request_body caps hold behind Caddy. A route that reads its body (the
// sign-in page's Server Action, an admin page's) gets 413 one byte past its cap and not at the cap.
describe.skipIf(!BASE || BASE.startsWith('http:'))('behind Caddy, request bodies are capped (SEC-005)', () => {
  it.each([
    ['/sign-in', 1_000_000],
    ['/admin/plots/new', 3 * 1024 * 1024],
  ])('%s: %d bytes pass to the app, one more is refused with 413', async (path, cap) => {
    const post = (n: number) => send(path, { method: 'POST', body: Buffer.alloc(n, 0x61), headers: { 'content-type': 'application/octet-stream' } });
    expect((await post(cap)).status).not.toBe(413);
    expect((await post(cap + 1)).status).toBe(413);
  }, 60_000);
});

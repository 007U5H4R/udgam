import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../verification/config';
import { ndviWindowOutcome } from '../verification/checks/ndvi_harvest_window';
import { createLogger } from '../log';
import { createSentinelProvider } from './sentinel';
import { MASKED_SCL_CLASSES, NDVI_EVALSCRIPT } from './sentinel-evalscript';
import { ProviderError, type PlotGeom } from './types';

// TSK-07.5 · TC-031: the Copernicus Sentinel Hub adapter. Token once, reused until exp − 60 s; the
// Statistical API request shape; parsing of recorded answers (synthetic until TSK-07.7 records real
// ones): monthly means with clear fractions, fully masked intervals (NaN mean, number or string) and
// missing intervals as not clear, a clear-pixel-weighted window mean, and a cloud-blocked window that
// makes ndvi_harvest_window unavailable. fetch is injected; nothing touches the network.

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const RECORDED = join(__dirname, '..', '..', '..', 'evals', 'fixtures', 'remote-sensing', 'recorded');
const recorded = (name: string) => (JSON.parse(readFileSync(join(RECORDED, name), 'utf8')) as { response: { body: unknown } }).response.body;

const CLIENT_ID = 'cdse-test-client';
const SECRET = 'cdse-test-secret-' + 's'.repeat(8);
const TOKEN = 'cdse-test-token-' + 't'.repeat(8);
const PLOT: PlotGeom = {
  id: 'P01',
  areaHa: 2,
  geometryHash: 'e'.repeat(64),
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [75.7388129, 12.4202301],
        [75.7401703, 12.4211414],
        [75.7395871, 12.4219699],
        [75.7382297, 12.4210586],
        [75.7388129, 12.4202301],
      ],
    ],
  },
};

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake CDSE: the token endpoint and the statistics endpoint answer from `stats` (a queue or a function). */
function fakeCdse(stats: (() => Response) | Response[], token: () => Response = () => json(200, { access_token: TOKEN, expires_in: 600, token_type: 'Bearer' })) {
  const calls: Call[] = [];
  const queue = Array.isArray(stats) ? [...stats] : null;
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).includes('/token')) return token();
    if (queue) return queue.shift() ?? json(500, {});
    return (stats as () => Response)();
  }) as typeof globalThis.fetch;
  const tokenCalls = () => calls.filter((c) => c.url.includes('/token'));
  const statCalls = () => calls.filter((c) => c.url.includes('/statistics'));
  return { fetch, calls, tokenCalls, statCalls };
}

const interval = (from: string, stats: Record<string, unknown>) => ({ interval: { from: `${from}T00:00:00Z`, to: `${from}T00:00:00Z` }, outputs: { ndvi: { bands: { B0: { stats } } } } });

describe('token (client credentials, cached until exp − 60 s)', () => {
  it('is requested once with grant_type=client_credentials and reused until 60 s before it expires', async () => {
    let t = Date.parse('2026-12-08T05:30:00.000Z');
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P01-history.json')));
    const s = createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch, now: () => new Date(t) });
    await s.ndviHistory(PLOT, '2026-12');
    await s.ndviHistory(PLOT, '2026-12');
    t += 539_000; // 540 s = exp − 60 s is the limit
    await s.ndviWindow(PLOT, '2026-12-08', 30);
    expect(cdse.tokenCalls()).toHaveLength(1);
    const { url, init } = cdse.tokenCalls()[0]!;
    expect(url).toBe('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: SECRET });
    t += 1_000; // now at exp − 60 s: refresh
    await s.ndviHistory(PLOT, '2026-12');
    expect(cdse.tokenCalls()).toHaveLength(2);
  });

  it('concurrent calls share one token request', async () => {
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P01-history.json')));
    const s = createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch });
    await Promise.all([s.ndviHistory(PLOT, '2026-12'), s.ndviHistory(PLOT, '2026-12'), s.ndviWindow(PLOT, '2026-12-08', 30)]);
    expect(cdse.tokenCalls()).toHaveLength(1);
  });

  it('a refused token → ProviderError http; a token body without access_token → malformed', async () => {
    const refused = fakeCdse([], () => json(401, { error: 'invalid_client' }));
    await expect(createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: refused.fetch }).ndviHistory(PLOT, '2026-12')).rejects.toEqual(new ProviderError('sentinel-hub', 401));
    const odd = fakeCdse([], () => json(200, { token_type: 'Bearer' }));
    await expect(createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: odd.fetch }).ndviHistory(PLOT, '2026-12')).rejects.toMatchObject({ kind: 'malformed' });
  });
});

describe('statistics request (TC-031)', () => {
  it('history: the plot in EPSG:4326, sentinel-2-l2a leastCC, P1M over the 12 months to endMonth, SHORTEN, 0.0001°, the NDVI evalscript, bearer token', async () => {
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P01-history.json')));
    await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviHistory(PLOT, '2026-12');
    const { url, init } = cdse.statCalls()[0]!;
    expect(url).toBe('https://sh.dataspace.copernicus.eu/statistics/v1');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      input: {
        bounds: { geometry: PLOT.polygon, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }],
      },
      aggregation: {
        timeRange: { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' },
        aggregationInterval: { of: 'P1M', lastIntervalBehavior: 'SHORTEN' },
        evalscript: NDVI_EVALSCRIPT,
        resx: 0.0001,
        resy: 0.0001,
      },
    });
  });

  it('window: P10D over [date − 30 d, date + 30 d]', async () => {
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P09-window-cloud.json')));
    await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviWindow(PLOT, '2026-08-08', 30);
    const body = JSON.parse(cdse.statCalls()[0]!.init.body as string) as { aggregation: { timeRange: unknown; aggregationInterval: unknown } };
    expect(body.aggregation.timeRange).toEqual({ from: '2026-07-09T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' });
    expect(body.aggregation.aggregationInterval).toEqual({ of: 'P10D', lastIntervalBehavior: 'SHORTEN' });
  });

  it('the evalscript reads B04, B08, SCL and dataMask, masks SCL 3/8/9/10/11 and outputs ndvi FLOAT32 + dataMask', () => {
    expect(MASKED_SCL_CLASSES).toEqual([3, 8, 9, 10, 11]);
    expect(NDVI_EVALSCRIPT).toContain('bands: ["B04", "B08", "SCL", "dataMask"]');
    expect(NDVI_EVALSCRIPT).toContain('[3, 8, 9, 10, 11]');
    expect(NDVI_EVALSCRIPT).toContain('{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }');
    expect(NDVI_EVALSCRIPT).toContain('{ id: "dataMask", bands: 1 }');
  });
});

describe('parsing (TC-031)', () => {
  it('recorded P01 history → 12 monthly means with clear fractions; the fully masked July has mean null', async () => {
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P01-history.json')));
    const { months } = await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviHistory(PLOT, '2026-12');
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2026-01', mean: 0.7, clearFraction: 0.95 });
    expect(months[6]).toEqual({ month: '2026-07', mean: null, clearFraction: 0 });
    expect(months[11]).toEqual({ month: '2026-12', mean: 0.72, clearFraction: 0.96 });
    const clear = months.flatMap((m) => (m.mean === null ? [] : [m.mean]));
    expect([clear.length, Math.min(...clear), Math.max(...clear)]).toEqual([11, 0.62, 0.81]);
  });

  it('a missing month, a "NaN" mean, noDataCount == sampleCount and a failed interval all count as not clear', async () => {
    const body = {
      status: 'OK',
      data: [
        interval('2026-01-01', { mean: 0.7, sampleCount: 100, noDataCount: 20 }),
        interval('2026-02-01', { mean: 'NaN', sampleCount: 100, noDataCount: 100 }),
        interval('2026-03-01', { mean: 0.1, sampleCount: 100, noDataCount: 100 }),
        // April absent from data[]
        { interval: { from: '2026-05-01T00:00:00Z', to: '2026-06-01T00:00:00Z' }, error: { type: 'EXECUTION_ERROR' } },
      ],
    };
    const cdse = fakeCdse(() => json(200, body));
    const { months } = await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviHistory(PLOT, '2026-12');
    expect(months.slice(0, 5)).toEqual([
      { month: '2026-01', mean: 0.7, clearFraction: 0.8 },
      { month: '2026-02', mean: null, clearFraction: 0 },
      { month: '2026-03', mean: null, clearFraction: 0 },
      { month: '2026-04', mean: null, clearFraction: 0 },
      { month: '2026-05', mean: null, clearFraction: 0 },
    ]);
  });

  it('window mean is the clear-pixel-weighted mean of the clear intervals; clearObservations counts them', async () => {
    const body = {
      status: 'OK',
      data: [
        interval('2026-11-08', { mean: 0.8, sampleCount: 100, noDataCount: 25 }), // 75 clear
        interval('2026-11-18', { mean: 'NaN', sampleCount: 100, noDataCount: 100 }),
        interval('2026-11-28', { mean: 0.6, sampleCount: 100, noDataCount: 75 }), // 25 clear
      ],
    };
    const cdse = fakeCdse(() => json(200, body));
    const w = await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviWindow(PLOT, '2026-12-08', 30);
    expect(w.clearObservations).toBe(2);
    expect(w.mean).toBeCloseTo(0.75, 10); // (0.8 × 75 + 0.6 × 25) / 100
  });

  it('recorded P09 cloud-blocked window → { mean: null, clearObservations: 0 } → ndvi_harvest_window unavailable with the cloud sentence', async () => {
    const cdse = fakeCdse(() => json(200, recorded('sentinel-P09-window-cloud.json')));
    const w = await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviWindow(PLOT, '2026-08-08', 30);
    expect(w).toEqual({ mean: null, clearObservations: 0 });
    expect(ndviWindowOutcome(w, CONFIG)).toMatchObject({ status: 'unavailable', evidence: 'Satellite view blocked by cloud for ±30 days' });
  });

  it.each([
    ['a non-JSON body', () => new Response('<html>busy</html>', { status: 200 })],
    ['no data array', () => json(200, { status: 'OK' })],
    ['noDataCount above sampleCount', () => json(200, { data: [interval('2026-01-01', { mean: 0.5, sampleCount: 10, noDataCount: 11 })] })],
    ['an NDVI mean outside [-1, 1]', () => json(200, { data: [interval('2026-01-01', { mean: 7, sampleCount: 10, noDataCount: 0 })] })],
    ['an interval without a start', () => json(200, { data: [{ outputs: {} }] })],
  ])('%s → ProviderError{kind:"malformed"}', async (_what, res) => {
    const cdse = fakeCdse(res);
    await expect(createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviHistory(PLOT, '2026-12')).rejects.toMatchObject({ provider: 'sentinel-hub', kind: 'malformed' });
  });

  it.each([429, 500, 503])('statistics HTTP %s → ProviderError{kind:"http"}', async (status) => {
    const cdse = fakeCdse(() => json(status, {}));
    await expect(createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch }).ndviWindow(PLOT, '2026-12-08', 30)).rejects.toEqual(new ProviderError('sentinel-hub', status));
  });
});

describe('401 on the statistics call', () => {
  it('refreshes the token once and retries; a second 401 → ProviderError http 401', async () => {
    const once = fakeCdse([json(401, {}), json(200, recorded('sentinel-P01-history.json'))]);
    const s = createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: once.fetch });
    expect((await s.ndviHistory(PLOT, '2026-12')).months).toHaveLength(12);
    expect([once.tokenCalls().length, once.statCalls().length]).toEqual([2, 2]);

    const twice = fakeCdse([json(401, {}), json(401, {})]);
    await expect(createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: twice.fetch }).ndviHistory(PLOT, '2026-12')).rejects.toEqual(new ProviderError('sentinel-hub', 401));
    expect([twice.tokenCalls().length, twice.statCalls().length]).toEqual([2, 2]);
  });
});

describe('abort and secrecy', () => {
  it('an aborted statistics request → ProviderError timeout', async () => {
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/token')) return json(200, { access_token: TOKEN, expires_in: 600 });
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }) as typeof globalThis.fetch;
    const ctl = new AbortController();
    const p = createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch }).ndviWindow(PLOT, '2026-12-08', 30, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 5);
    await expect(p).rejects.toEqual(new ProviderError('sentinel-hub', 'timeout'));
  });

  it('neither the client secret nor the token reaches a log line or an error', async () => {
    const lines: string[] = [];
    const log = createLogger('debug', new Writable({ write: (c: Buffer, _e, cb) => (lines.push(c.toString()), cb()) }));
    const errors: unknown[] = [];
    for (const stats of [() => json(500, {}), () => new Response('nope', { status: 200 }), () => Promise.reject(new TypeError('fetch failed')) as never]) {
      const cdse = fakeCdse(stats);
      await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: cdse.fetch, log }).ndviHistory(PLOT, '2026-12').catch((e: unknown) => errors.push(e));
    }
    const refused = fakeCdse([], () => json(401, { error: 'invalid_client' }));
    await createSentinelProvider({ clientId: CLIENT_ID, clientSecret: SECRET, fetch: refused.fetch, log }).ndviHistory(PLOT, '2026-12').catch((e: unknown) => errors.push(e));
    expect(errors).toHaveLength(4);
    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('') + errors.map((e) => `${String(e)} ${JSON.stringify(e)}`).join('');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(TOKEN);
  });
});

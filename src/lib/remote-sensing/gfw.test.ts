import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../log';
import { createGfwProvider } from './gfw';
import { ProviderError, type PlotGeom } from './types';

// TSK-07.4 · TC-030: the GFW adapter's request (URL, method, headers, SQL, geometry) and its parsing of
// recorded answers (evals/fixtures/remote-sensing/recorded; synthetic until TSK-07.7 records real ones).
// fetch is injected: no test touches the network. The key is low-entropy on purpose (not scan bait).

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const RECORDED = join(__dirname, '..', '..', '..', 'evals', 'fixtures', 'remote-sensing', 'recorded');
type Recorded = { response: { status: number; url: string; body: unknown } };
const recorded = (name: string) => JSON.parse(readFileSync(join(RECORDED, name), 'utf8')) as Recorded;

const KEY = 'gfw-test-key-' + 'k'.repeat(8);
const ORIGIN = 'https://udgam.example';
const PLOT: PlotGeom = {
  id: 'X06',
  areaHa: 2,
  geometryHash: 'f'.repeat(64),
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [75.77, 13.31],
        [75.771, 13.31],
        [75.771, 13.311],
        [75.77, 13.311],
        [75.77, 13.31],
      ],
    ],
  },
};

function respond(status: number, body: unknown, url = 'https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss/v1.13/query/json') {
  const res = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

function spy(res: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return res();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function captureLog() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _e, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { log: createLogger('debug', stream), lines };
}

describe('GFW request (TC-030)', () => {
  it('POSTs the pinned query with the key header, JSON body {sql, geometry} and origin', async () => {
    const { fetch, calls } = spy(() => respond(200, recorded('gfw-P01.json').response.body));
    await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss(PLOT);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss/v1.13/query/json');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('follow');
    expect(init.headers).toEqual({ 'x-api-key': KEY, 'content-type': 'application/json', origin: ORIGIN });
    expect(JSON.parse(init.body as string)).toEqual({
      sql:
        'SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha FROM results\n' +
        'WHERE umd_tree_cover_loss__year >= 2021 AND umd_tree_cover_density_2000__threshold >= 10\n' +
        'GROUP BY umd_tree_cover_loss__year',
      geometry: PLOT.polygon,
    });
  });

  it('honours baseUrl and datasetVersion, and hands fetch the caller’s signal', async () => {
    const { fetch, calls } = spy(() => respond(200, { data: [], status: 'success' }));
    const ctl = new AbortController();
    await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch, baseUrl: 'https://gfw.test/', datasetVersion: 'latest' }).forestLoss(PLOT, { signal: ctl.signal });
    expect(calls[0]!.url).toBe('https://gfw.test/dataset/umd_tree_cover_loss/latest/query/json');
    expect(calls[0]!.init.signal).toBe(ctl.signal);
  });
});

describe('GFW response parsing (TC-030)', () => {
  it('recorded P01 (no rows) → 0 ha, 0 %, from 2021, data through 2025, v1.13', async () => {
    const { fetch } = spy(() => respond(200, recorded('gfw-P01.json').response.body));
    expect(await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss({ ...PLOT, id: 'P01' })).toEqual({
      lossHa: 0,
      lossPct: 0,
      yearsFrom: 2021,
      dataYear: 2025,
      datasetVersion: 'v1.13',
      source: 'live',
    });
  });

  it('recorded X06 → lossHa = Σ area__ha = 0.8, lossPct = 0.8 / 2.0 × 100 = 40; `latest` pins the version it redirected to', async () => {
    const rec = recorded('gfw-X06.json');
    const { fetch } = spy(() => respond(200, rec.response.body, rec.response.url));
    const r = await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch, datasetVersion: 'latest' }).forestLoss(PLOT);
    expect(r.lossHa).toBeCloseTo(0.8, 10);
    expect(r.lossPct).toBeCloseTo(40, 10);
    expect(r).toMatchObject({ yearsFrom: 2021, dataYear: 2025, datasetVersion: 'v1.13' });
  });

  it.each([403, 429, 500, 503])('HTTP %s → ProviderError{kind:"http"}', async (status) => {
    const { fetch } = spy(() => respond(status, { status: 'failed', message: 'no' }));
    await expect(createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss(PLOT)).rejects.toEqual(new ProviderError('gfw', status));
  });

  it.each([
    ['a non-JSON body', '<html>Bad gateway</html>'],
    ['status not success', { status: 'failed', data: [] }],
    ['no data array', { status: 'success' }],
    ['a row without area', { status: 'success', data: [{ umd_tree_cover_loss__year: 2022 }] }],
    ['a negative area', { status: 'success', data: [{ umd_tree_cover_loss__year: 2022, area__ha: -1 }] }],
    ['a string year', { status: 'success', data: [{ umd_tree_cover_loss__year: '2022', area__ha: 0.1 }] }],
  ])('%s → ProviderError{kind:"malformed"}', async (_what, body) => {
    const { fetch } = spy(() => respond(200, body));
    await expect(createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss(PLOT)).rejects.toMatchObject({ provider: 'gfw', kind: 'malformed' });
  });

  it('an aborted request → ProviderError{kind:"timeout"}', async () => {
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      await new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return respond(200, {});
    }) as typeof globalThis.fetch;
    const ctl = new AbortController();
    const p = createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss(PLOT, { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toEqual(new ProviderError('gfw', 'timeout'));
  });

  it('a network failure → ProviderError{kind:"http"} without a status', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    await expect(createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch }).forestLoss(PLOT)).rejects.toMatchObject({ provider: 'gfw', kind: 'http', status: 0 });
  });
});

describe('the key stays out of logs and errors (TC-030)', () => {
  it('no log line and no error message carries the key, whatever happens', async () => {
    const { log, lines } = captureLog();
    const errors: unknown[] = [];
    for (const res of [() => respond(403, { message: 'bad key' }), () => respond(200, 'not json'), () => Promise.reject(new TypeError('fetch failed'))]) {
      const { fetch } = spy(res);
      await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch, log }).forestLoss(PLOT).catch((e: unknown) => errors.push(e));
    }
    expect(errors).toHaveLength(3);
    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('') + errors.map((e) => `${String(e)} ${JSON.stringify(e)}`).join('');
    expect(all).not.toContain(KEY);
  });
});

describe('health probe', () => {
  it('GETs the dataset metadata with the key; non-2xx → ProviderError', async () => {
    const ok = spy(() => respond(200, { data: {} }, 'https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss'));
    await createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch: ok.fetch }).probe();
    expect(ok.calls[0]).toMatchObject({ url: 'https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss', init: { method: 'GET' } });
    const bad = spy(() => respond(403, {}));
    await expect(createGfwProvider({ apiKey: KEY, origin: ORIGIN, fetch: bad.fetch }).probe()).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHarnessInputs } from './context';
import { loadDataset } from './dataset';
import { liveAgreement, missingLiveVars, renderAgreement } from './live-agreement';
import { main, parseArgs } from './run';

// TSK-07.7: `pnpm eval --provider=live` compares live GFW / Sentinel Hub answers for P01–P10 with the
// fixtures (no gate, never in CI) and `--record` saves the raw answers. Without its keys it exits 2 and
// names the missing variables only, never a value. The dataset (0.4.0, EVAL-106–108) still validates.

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
};
const mustNotRun = async () => {
  throw new Error('must not run');
};

describe('--provider=live without keys (TSK-07.7)', () => {
  it('exits 2 listing the missing variable names, runs nothing', async () => {
    const c = io();
    const code = await main(['--provider=live'], mustNotRun, c.io, { env: {}, live: mustNotRun });
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('GFW_API_KEY, CDSE_CLIENT_ID, CDSE_CLIENT_SECRET');
  });

  it('names only what is missing and never prints a value that is set', async () => {
    const canary = 'canary-'.repeat(4);
    const c = io();
    const code = await main(['--provider=live'], mustNotRun, c.io, { env: { GFW_API_KEY: canary, CDSE_CLIENT_ID: '' }, live: mustNotRun });
    expect(code).toBe(2);
    const text = c.err.join('\n');
    expect(text).toContain('CDSE_CLIENT_ID, CDSE_CLIENT_SECRET');
    expect(text).not.toContain('GFW_API_KEY,');
    expect(text).not.toContain(canary);
    expect(missingLiveVars({ GFW_API_KEY: canary })).toEqual(['CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET']);
  });

  it('--record needs --provider=live', async () => {
    const c = io();
    expect(await main(['--record'], mustNotRun, c.io, { env: {} })).toBe(2);
    expect(c.err.join('\n')).toMatch(/--record needs --provider=live/);
    expect(parseArgs(['--provider=live', '--record'])).toMatchObject({ provider: 'live', record: true });
    expect(() => parseArgs(['--record=yes'])).toThrow(/--record/);
  });

  it('with the keys it runs the agreement (no gate: exit 0) and never the fixture harness', async () => {
    const c = io();
    const env = { GFW_API_KEY: 'k', CDSE_CLIENT_ID: 'i', CDSE_CLIENT_SECRET: 's' };
    let asked: unknown;
    const code = await main(['--provider=live', '--record'], mustNotRun, c.io, {
      env,
      live: async (o) => {
        asked = o;
        return { reportPath: '/tmp/x.md', agreed: 29, total: 30, recorded: ['a', 'b'] };
      },
    });
    expect(code).toBe(0);
    expect(asked).toMatchObject({ record: true });
    expect(c.out.join('\n')).toContain('29/30');
  });
});

describe('liveAgreement with recorded answers (no network)', () => {
  const RECORDED = join(__dirname, '..', 'fixtures', 'remote-sensing', 'recorded');
  const body = (f: string) => (JSON.parse(readFileSync(join(RECORDED, f), 'utf8')) as { response: { body: unknown } }).response.body;
  const fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/token')) return Response.json({ access_token: 'secret-token-value', expires_in: 600 });
    if (u.includes('/statistics')) return Response.json(body('sentinel-P01-history.json'));
    return Response.json(body('gfw-P01.json'));
  }) as typeof globalThis.fetch;

  it('compares the ten legitimate plots on three kinds and records every answer except the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-live-'));
    const inputs = loadHarnessInputs(loadDataset());
    const env = { GFW_API_KEY: 'k', CDSE_CLIENT_ID: 'i', CDSE_CLIENT_SECRET: 's' };
    const { rows, recorded } = await liveAgreement({ inputs, env, record: true, fetch, recordedDir: dir, now: () => new Date('2026-12-08T05:30:00.000Z') });
    expect(rows).toHaveLength(30);
    expect(rows.find((r) => r.plotId === 'P01' && r.kind === 'loss')).toMatchObject({ agree: true, fixture: { status: 'ok' }, live: { status: 'ok' } });
    // the recorded history answer is P01's; the window P10D intervals come from the same monthly body here
    expect(rows.filter((r) => r.kind === 'ndvi_history').every((r) => r.agree)).toBe(true);
    expect(recorded).toContain(join(dir, 'P01-loss.json'));
    const rec = JSON.parse(readFileSync(join(dir, 'P01-loss.json'), 'utf8')) as Record<string, unknown>;
    expect(rec).toMatchObject({ plotId: 'P01', kind: 'loss', fetchedAt: '2026-12-08T05:30:00.000Z', providerVersion: 'v1.13', response: { status: 200 } });
    expect(existsSync(join(dir, 'P01-ndvi_history.json'))).toBe(true);
    for (const f of recorded) expect(readFileSync(f, 'utf8')).not.toContain('secret-token-value');
    const md = renderAgreement(rows, { ranAt: '2026-12-08T05:30:00.000Z', commit: 'abc1234' });
    expect(md).toMatch(/\*\*Agreement: \d+\/30\*\*/);
  });
});

describe('dataset 0.4.0 (TSK-07.7)', () => {
  it('validates, and scenario 3 has 10 active S1 attack cases (EVAL-037–043, 106–108)', () => {
    const ds = loadDataset();
    expect(ds.version).toBe('0.4.0');
    const s3 = ds.cases.filter((c) => c.scenario === 3 && c.case_class === 'attack' && c.status === 'active' && (c.gates ?? []).includes('S1')).map((c) => c.id);
    expect(s3.sort()).toEqual(['EVAL-037', 'EVAL-038', 'EVAL-039', 'EVAL-040', 'EVAL-041', 'EVAL-042', 'EVAL-043', 'EVAL-106', 'EVAL-107', 'EVAL-108']);
    expect(ds.fixtures.plots.map((p) => p.id)).toEqual(expect.arrayContaining(['X08', 'X09', 'X10']));
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLiveProvider, plotGeom, withTimeouts } from '../../src/lib/remote-sensing';
import type { RsProfile } from '../../src/lib/remote-sensing/fixture';
import { ProviderError, type ForestLoss, type NdviHistory, type NdviWindow, type PlotGeom, type RemoteSensingProvider } from '../../src/lib/remote-sensing/types';
import { forestLossOutcome } from '../../src/lib/verification/checks/deforestation_overlap';
import { ndviHistoryOutcome } from '../../src/lib/verification/checks/ndvi_cultivation';
import { ndviWindowOutcome } from '../../src/lib/verification/checks/ndvi_harvest_window';
import { CONFIG } from '../../src/lib/verification/config';
import { istDate, istMonth } from '../../src/lib/verification/evidence';
import type { CheckStatus } from '../../src/lib/verification/types';
import { SERVER_RECEIVED_AT, type HarnessInputs } from './context';
import { RS_DIR } from './fixtures';

// `pnpm eval --provider=live` (technical-plan TSK-07.7): ask the real providers (GFW, Copernicus Sentinel
// Hub) about the legitimate fixture plots P01–P10 and compare each answer with the fixture profile, as
// an agreement table. There is no gate: the fixture plots are synthetic polygons near real places, so
// disagreement is information for the owner, not a failure. It needs GFW_API_KEY, CDSE_CLIENT_ID and
// CDSE_CLIENT_SECRET from the environment and is never run in CI. Each call has the app's 8 s timeout.
// With --record, every raw provider answer (a cloud-blocked window included; a failed call never) is
// written to evals/fixtures/remote-sensing/recorded/ under the names the adapter tests read —
// gfw-<plot>.json, sentinel-<plot>-history.json, sentinel-<plot>-window[-cloud].json — with its fetch
// time and the provider version, replacing the synthetic recordings.

export const LIVE_ENV_VARS = ['GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET'] as const;
export const RECORDED_DIR = join(RS_DIR, 'recorded');
export const AGREEMENT_PLOTS = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10'] as const;

/** The live variables that are unset or empty (names only: a value is never read into a message). */
export function missingLiveVars(env: Record<string, string | undefined>): string[] {
  return LIVE_ENV_VARS.filter((k) => !env[k]);
}

type Kind = 'loss' | 'ndvi_history' | 'ndvi_window';
type Side = { status: CheckStatus; summary: string };
export type AgreementRow = { plotId: string; kind: Kind; fixture: Side; live: Side; agree: boolean };
export type Recording = { plotId: string; kind: Kind; fetchedAt: string; providerVersion: string; request: { method: string; url: string }; response: { status: number; url: string; body: unknown } };

const fmt = (x: number | null) => (x === null ? '—' : x.toFixed(2));

function lossSide(r: Pick<ForestLoss, 'lossPct' | 'source'>): Side {
  return { status: forestLossOutcome(r, CONFIG).status, summary: `${r.lossPct.toFixed(1)} % loss` };
}
function historySide(h: NdviHistory): Side {
  const clear = h.months.flatMap((m) => (m.mean === null ? [] : [m.mean]));
  const range = clear.length > 0 ? `${fmt(Math.min(...clear))}–${fmt(Math.max(...clear))}` : '—';
  return { status: ndviHistoryOutcome(h, CONFIG).status, summary: `NDVI ${range} over ${clear.length} clear months` };
}
function windowSide(w: NdviWindow): Side {
  return { status: ndviWindowOutcome(w, CONFIG).status, summary: `NDVI ${fmt(w.mean)} over ${w.clearObservations} clear` };
}
/** The recording file the adapter tests read for this answer (gfw.test.ts, sentinel.test.ts). */
export function recordingName(plotId: string, kind: Kind, cloud = false): string {
  if (kind === 'loss') return `gfw-${plotId}.json`;
  if (kind === 'ndvi_history') return `sentinel-${plotId}-history.json`;
  return `sentinel-${plotId}-window${cloud ? '-cloud' : ''}.json`;
}

const failed = (e: unknown): Side => ({ status: 'unavailable', summary: e instanceof ProviderError ? `provider ${e.kind}${e.status ? ` ${e.status}` : ''}` : `error ${e instanceof Error ? e.constructor.name : typeof e}` });

/** The live side of a row, and the answer itself when the provider answered (a failed call has none). */
async function side<T>(call: () => Promise<T>, toSide: (t: T) => Side): Promise<{ side: Side; answer?: T }> {
  try {
    const answer = await call();
    return { side: toSide(answer), answer };
  } catch (e) {
    return { side: failed(e) };
  }
}

/** A fetch that remembers every answer (a clone of its body) for --record, by URL. */
function recordingFetch(inner: typeof globalThis.fetch) {
  const seen: { method: string; url: string; status: number; finalUrl: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await inner(input, init);
    const url = String(input);
    // The token endpoint's answer is a credential: never recorded.
    if (!url.includes('/token')) {
      let body: unknown = null;
      try {
        body = await res.clone().json();
      } catch {
        body = null;
      }
      seen.push({ method: init?.method ?? 'GET', url, status: res.status, finalUrl: res.url || url, body });
    }
    return res;
  }) as typeof globalThis.fetch;
  return { fetch, take: () => seen.splice(0, seen.length) };
}

export type LiveAgreementOptions = {
  inputs: HarnessInputs;
  env: Record<string, string | undefined>;
  record?: boolean;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  recordedDir?: string;
};

/** Ask the live providers about P01–P10 and compare with the fixtures; optionally record the answers. */
export async function liveAgreement(o: LiveAgreementOptions): Promise<{ rows: AgreementRow[]; recorded: string[] }> {
  const now = o.now ?? (() => new Date());
  const rec = recordingFetch(o.fetch ?? globalThis.fetch);
  const live: RemoteSensingProvider = withTimeouts(createLiveProvider(
    {
      REMOTE_SENSING_PROVIDER: 'live',
      PUBLIC_BASE_URL: o.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
      GFW_API_KEY: o.env.GFW_API_KEY,
      CDSE_CLIENT_ID: o.env.CDSE_CLIENT_ID,
      CDSE_CLIENT_SECRET: o.env.CDSE_CLIENT_SECRET,
    },
    { fetch: rec.fetch },
  ));
  const endMonth = istMonth(SERVER_RECEIVED_AT);
  const centre = istDate(SERVER_RECEIVED_AT);
  const days = CONFIG.ndviHarvestWindow.windowDays;
  const rows: AgreementRow[] = [];
  const recorded: string[] = [];
  const dir = o.recordedDir ?? RECORDED_DIR;

  for (const plotId of AGREEMENT_PLOTS) {
    const feature = o.inputs.plots[plotId];
    const profile: RsProfile | undefined = o.inputs.profiles[plotId];
    const spec = o.inputs.dataset.fixtures.plots.find((p) => p.id === plotId);
    if (!feature || !profile || !spec) continue;
    const geom: PlotGeom = await plotGeom({ id: plotId, polygon: feature.geometry, areaHa: spec.area_ha });
    const fixtureMonths = profile.ndviHistory.byCalendarMonth.map((m) => ({ month: String(m.month), mean: m.mean, clearFraction: m.clearFraction }));
    const kinds: [Kind, Side, () => Promise<{ side: Side; answer?: ForestLoss | NdviHistory | NdviWindow }>][] = [
      ['loss', lossSide({ ...profile.forestLoss, source: 'fixture' }), () => side(() => live.forestLoss(geom), lossSide)],
      ['ndvi_history', historySide({ months: fixtureMonths, source: 'fixture' }), () => side(() => live.ndviHistory(geom, endMonth), historySide)],
      ['ndvi_window', windowSide({ ...profile.ndviWindow, source: 'fixture' }), () => side(() => live.ndviWindow(geom, centre, days), windowSide)],
    ];
    for (const [kind, fixture, ask] of kinds) {
      const { side: liveSide, answer } = await ask();
      rows.push({ plotId, kind, fixture, live: liveSide, agree: fixture.status === liveSide.status });
      const answers = rec.take();
      if (o.record && answer !== undefined && answers.length > 0) {
        const a = answers[answers.length - 1]!;
        const version = kind === 'loss' ? (/\/umd_tree_cover_loss\/(v[0-9][0-9.]*)\//.exec(a.finalUrl)?.[1] ?? CONFIG.deforestation.gfwDatasetVersion) : 'statistics/v1 sentinel-2-l2a';
        const recording: Recording = {
          plotId,
          kind,
          fetchedAt: now().toISOString(),
          providerVersion: version,
          request: { method: a.method, url: a.url },
          response: { status: a.status, url: a.finalUrl, body: a.body },
        };
        mkdirSync(dir, { recursive: true });
        const cloud = kind === 'ndvi_window' && (answer as NdviWindow).mean === null;
        const file = join(dir, recordingName(plotId, kind, cloud));
        writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
        recorded.push(file);
      }
    }
  }
  return { rows, recorded };
}

/** The agreement table (Markdown). Agreement = same check status from the live answer as from the fixture. */
export function renderAgreement(rows: AgreementRow[], meta: { ranAt: string; commit: string }): string {
  const agreed = rows.filter((r) => r.agree).length;
  return [
    `# Live remote-sensing agreement — ${meta.ranAt}`,
    '',
    `Commit \`${meta.commit}\`. \`pnpm eval --provider=live\` asked Global Forest Watch and Copernicus Sentinel Hub about the fixture plots P01–P10 and compared each answer's check status with the fixture profile's. No gate: the fixture plots are synthetic polygons near real places.`,
    '',
    `**Agreement: ${agreed}/${rows.length}**`,
    '',
    '| Plot | Kind | Fixture | Live | Agree |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.plotId} | ${r.kind} | ${r.fixture.status} (${r.fixture.summary}) | ${r.live.status} (${r.live.summary}) | ${r.agree ? 'yes' : 'no'} |`),
    '',
  ].join('\n');
}

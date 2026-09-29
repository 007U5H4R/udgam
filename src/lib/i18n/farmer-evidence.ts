import type { CheckId, CheckResult, VerifyResult } from '../verification/types';
import { t, type Lang, type MessageKey } from './index';

// The farmer copy layer (Design.md §19, TSK-10.1): the verifier's evidence sentences (technical-plan
// §6.5) rewritten in plain words for the verdict screens, at most three lines. Every number is taken
// from the evidence sentence as written (the measured value, already rounded by §6.5) and passed
// through; nothing is recomputed. Words follow D5: no accusation words anywhere (TC-057 guard).

export type FarmerIcon = 'location' | 'camera' | 'tree' | 'cloud' | 'trend' | 'seal' | 'check';
/** One evidence line. `next` marks "what happens next / what to do" (drawn with a plain bubble). */
export type FarmerLine = { icon: FarmerIcon; text: string; next?: true };

type Ctx = { plot?: string };
type Tr = (key: MessageKey, vars?: Record<string, string | number>) => string;

const ICON: Record<CheckId, FarmerIcon> = {
  signature_valid: 'seal',
  chain_continuity: 'seal',
  geofence: 'location',
  gps_accuracy: 'location',
  exif_gps_agreement: 'location',
  movement_plausibility: 'location',
  photo_uniqueness: 'camera',
  exif_time_agreement: 'camera',
  deforestation_overlap: 'tree',
  ndvi_cultivation: 'tree',
  ndvi_harvest_window: 'cloud',
  yield_plausibility: 'trend',
};

/** The n-th capture group of `re` in `s`, or null. */
const grab = (s: string, re: RegExp, n = 1): string | null => re.exec(s)?.[n] ?? null;
const metres = (s: string) => grab(s, /(-?\d+ m)\b/);
const plotName = (ctx: Ctx, tr: Tr) => ctx.plot ?? tr('fe.plot.default');

/** A finding's line in plain words, or null when the check has nothing to say to the farmer. */
function findingLine(c: CheckResult, tr: Tr, ctx: Ctx): string | null {
  const e = c.evidence;
  if (e.startsWith('Check could not run')) return tr('fe.threw');
  switch (c.id) {
    case 'signature_valid':
      if (/revoked on/.test(e)) return tr('fe.seal.revoked', { date: grab(e, /revoked on (\S+)/) ?? '' });
      if (/not enrolled/.test(e)) return tr('fe.seal.unknown');
      return tr('fe.seal.bad');
    case 'chain_continuity':
      return /new phone/.test(e) ? tr('fe.chain.newPhone') : tr('fe.chain.order');
    case 'geofence': {
      const m = metres(e) ?? '';
      return c.status === 'flag' ? tr('fe.location.edge', { m, plot: plotName(ctx, tr) }) : tr('fe.location.outside', { m, plot: plotName(ctx, tr) });
    }
    case 'gps_accuracy':
      return tr('fe.gps.weak', { m: metres(e) ?? '' });
    case 'exif_gps_agreement':
      return /no location/.test(e) ? tr('fe.photoGps.none') : tr('fe.photoGps.far', { m: metres(e) ?? '' });
    case 'exif_time_agreement': {
      if (/no time data/.test(e)) return tr('fe.photoTime.none');
      const photo = grab(e, /Photo time (.+?) from capture time/);
      const clock = grab(e, /phone clock (.+?) from server/);
      // Name the gap that crossed its fail limit (EXE10): the phone clock only when the sentence says the
      // clock gap ("fail over 7 days") failed and the photo gap ("fail over 24 h") did not.
      if (c.status === 'fail' && clock && /fail over 7 days/.test(e) && !/fail over 24 h/.test(e)) return tr('fe.photoTime.clock', { d: clock });
      return tr('fe.photoTime.far', { d: photo ?? clock ?? '' });
    }
    case 'movement_plausibility':
      if (/did not advance/.test(e)) return tr('fe.move.clock');
      return tr('fe.move.far', { m: grab(e, /entry (\d+ m) away/) ?? '', min: grab(e, /away (-?\d+) min/) ?? '' });
    case 'photo_uniqueness':
      return tr('fe.photos.used', { k: grab(e, /^(\d+) of/) ?? '', n: grab(e, /of (\d+)/) ?? '' });
    case 'deforestation_overlap':
      if (c.status === 'unavailable') return tr('fe.forest.down');
      return tr('fe.forest.loss', { pct: grab(e, /^([\d.]+%)/) ?? '', year: grab(e, /since (\d{4})/) ?? '' });
    case 'ndvi_cultivation':
      if (c.status === 'unavailable') return /clear months/.test(e) ? tr('fe.canopy.few') : tr('fe.sat.down');
      return tr('fe.canopy.none');
    case 'ndvi_harvest_window':
      if (c.status === 'unavailable') return /cloud/.test(e) ? tr('fe.sat.cloud') : tr('fe.sat.down');
      return tr('fe.sat.low', { ndvi: grab(e, /NDVI ([\d.]+)/) ?? '' });
    case 'yield_plausibility':
      if (c.status === 'unavailable') return tr('fe.yield.none');
      return tr('fe.yield.high', { x: grab(e, /total ([\d.]+x)/) ?? '' });
  }
}

/** What the farmer can do after a Not-accepted verdict, by the check that decided it. */
function todoFor(c: CheckResult | undefined, tr: Tr, ctx: Ctx): string {
  switch (c?.id) {
    case 'photo_uniqueness':
      return tr('fe.todo.photos');
    case 'signature_valid':
    case 'chain_continuity':
      return tr('fe.todo.seal');
    case 'geofence':
    case 'gps_accuracy':
    case 'exif_gps_agreement':
    case 'movement_plausibility':
      return tr('fe.todo.location', { plot: plotName(ctx, tr) });
    default:
      return tr('fe.todo.office');
  }
}

/** The positive lines of a Verified result, in the mockup's order, with fallbacks. At most three. */
function positives(checks: Map<CheckId, CheckResult>, tr: Tr, ctx: Ctx): FarmerLine[] {
  const ok = (id: CheckId) => {
    const c = checks.get(id);
    return c && c.status === 'ok' ? c : undefined;
  };
  const out: FarmerLine[] = [];
  const geo = ok('geofence');
  if (geo) out.push({ icon: 'location', text: tr('fe.location.inside', { m: metres(geo.evidence) ?? '', plot: plotName(ctx, tr) }) });
  const photos = ok('photo_uniqueness');
  if (photos) {
    const n = Number(grab(photos.evidence, /of (\d+)/) ?? 0);
    const today = ok('exif_time_agreement') ? 'Today' : '';
    out.push({ icon: 'camera', text: tr(n === 1 ? `fe.photos.new1${today}` : `fe.photos.new${today}`, { n }) });
  }
  const forest = ok('deforestation_overlap');
  if (forest) out.push({ icon: 'tree', text: tr('fe.forest.none', { year: grab(forest.evidence, /since (\d{4})/) ?? '' }) });
  const fallbacks: [CheckId, FarmerLine['icon'], MessageKey][] = [
    ['ndvi_cultivation', 'tree', 'fe.canopy.ok'],
    ['ndvi_harvest_window', 'cloud', 'fe.sat.ok'],
    ['signature_valid', 'seal', 'fe.seal.ok'],
  ];
  for (const [id, icon, key] of fallbacks) if (out.length < 3 && ok(id)) out.push({ icon, text: tr(key) });
  return out.slice(0, 3);
}

/** Findings worth telling the farmer, most serious first: hard fails, fails, unavailable, capped flags, flags. */
function findings(r: VerifyResult): CheckResult[] {
  const rank = (c: CheckResult) =>
    c.hardFail ? 0 : c.status === 'fail' ? 1 : c.status === 'unavailable' ? 2 : r.capReasons.includes(`flag:${c.id}`) ? 3 : c.status === 'flag' ? 4 : 9;
  return r.checks.filter((c) => rank(c) < 9).sort((a, b) => rank(a) - rank(b));
}

/**
 * The verdict screen's evidence lines (max 3): Verified → where, photos, forest (positives); Needs
 * Review → the reason(s) and "The office will look at this. You don't need to do anything."; Rejected
 * → the reason that decided it and what to do.
 */
export function farmerLines(result: VerifyResult, lang: Lang, ctx: Ctx = {}): FarmerLine[] {
  const tr: Tr = (key, vars = {}) => t(key, vars, lang);
  const byId = new Map(result.checks.map((c) => [c.id, c]));
  if (result.verdict === 'Verified') return positives(byId, tr, ctx);

  const lines: FarmerLine[] = [];
  const found = findings(result);
  const seen = new Set<string>();
  for (const c of found) {
    const text = findingLine(c, tr, ctx);
    if (text === null || seen.has(text)) continue;
    seen.add(text);
    lines.push({ icon: ICON[c.id], text });
    if (lines.length === (result.verdict === 'Rejected' ? 1 : 2)) break;
  }
  if (result.verdict === 'Rejected') lines.push({ icon: 'check', text: todoFor(found[0], tr, ctx), next: true });
  else lines.push({ icon: 'check', text: tr('fe.office'), next: true });
  return lines.slice(0, 3);
}

/** Every boundary refusal the capture route answers (technical-plan §3.1 step 1–2, TKT-19). */
const REFUSALS = [
  'plot_not_assigned',
  'device_revoked',
  'unknown_device',
  'device_not_owned',
  'bad_signature',
  'media_hash_mismatch',
  'media_count',
  'media_too_large',
  'media_type',
  'length_required',
  'body_too_large',
  'bad_schema',
  'non_canonical',
  'bad_form',
  'rate_limited',
  'unauthenticated',
] as const;
type Refusal = (typeof REFUSALS)[number];

/** Refusals that retrying can fix, so the signed picking stays saved on the phone. */
const KEEPS_OUTBOX: ReadonlySet<string> = new Set<Refusal>(['rate_limited', 'unauthenticated']);

export type RefusalCopy = { happened: string; todo: string; nothingLost: boolean };

/** What happened · what to do · whether nothing is lost, for a capture refused at the boundary. */
export function refusalCopy(reason: string, lang: Lang, o: { retryAfterSec?: number } = {}): RefusalCopy {
  const tr: Tr = (key, vars = {}) => t(key, vars, lang);
  const known = (REFUSALS as readonly string[]).includes(reason) ? (reason as Refusal) : 'other';
  const happened = tr(`refusal.${known}.happened` as MessageKey);
  let todo = tr(`refusal.${known}.todo` as MessageKey);
  if (known === 'rate_limited') {
    const min = Math.max(1, Math.ceil((o.retryAfterSec ?? 60) / 60));
    todo = tr(min === 1 ? 'refusal.rate_limited.todo1' : 'refusal.rate_limited.todo', { min });
  }
  return { happened, todo, nothingLost: KEEPS_OUTBOX.has(known) };
}

/** Does retrying after this refusal make sense (keep the signed copy on the phone)? */
export const refusalKeepsOutbox = (reason: string): boolean => KEEPS_OUTBOX.has(reason);

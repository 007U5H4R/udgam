import type { CheckId, CheckResult, Verdict } from '../verification/types';
import { formatScore } from '../format';

// Words for the admin review screens (TKT-12), ported from .design/exploration/final/admin.html. English
// only: the admin surface ships in English (N5), like the plot screens' copy (TKT-06); these move into
// src/lib/i18n when the admin screens are translated. The admin reads the SYSTEM evidence sentences
// (technical-plan §6.5) verbatim, never the farmer copy; this module only names checks, states and
// the reasons a picking needs a person. Pure (no Next imports): the queue query and the pages share it.

/** The admin's names for the twelve checks (admin.html CHECKS), in registry order. */
export const CHECK_NAME: Record<CheckId, string> = {
  signature_valid: "Phone's seal",
  chain_continuity: 'Seal chain',
  photo_uniqueness: 'Photos are new',
  geofence: 'Inside the plot',
  gps_accuracy: 'Location accuracy',
  exif_gps_agreement: 'Photo location',
  exif_time_agreement: 'Photo time',
  movement_plausibility: 'Travel since last record',
  deforestation_overlap: 'Forest map',
  ndvi_cultivation: 'Coffee grown here, 12 months',
  ndvi_harvest_window: 'Satellite view this month',
  yield_plausibility: 'Harvest size',
};

/** A check's state as the review shows it: a hard fail is final, apart from an ordinary fail. */
export type CheckState = 'hard' | 'fail' | 'na' | 'flag' | 'ok';

export const STATE_VIEW: Record<CheckState, { word: string; cls: 'bad' | 'na' | 'check' | 'ok'; mark: 'bad' | 'na' | 'check' | 'ok'; rank: number }> = {
  hard: { word: 'Failed · final', cls: 'bad', mark: 'bad', rank: 0 },
  fail: { word: 'Failed', cls: 'bad', mark: 'bad', rank: 1 },
  na: { word: "Couldn't run", cls: 'na', mark: 'na', rank: 2 },
  flag: { word: 'Flagged', cls: 'check', mark: 'check', rank: 3 },
  ok: { word: 'Passed', cls: 'ok', mark: 'ok', rank: 4 },
};

export function checkState(c: Pick<CheckResult, 'status' | 'hardFail'>): CheckState {
  if (c.hardFail) return 'hard';
  if (c.status === 'unavailable') return 'na';
  return c.status;
}

/** The checks worst first (hard fail, fail, couldn't run, flagged, passed), registry order within a state. */
export function sortedChecks<T extends Pick<CheckResult, 'status' | 'hardFail'>>(checks: readonly T[]): T[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => STATE_VIEW[checkState(a.c)].rank - STATE_VIEW[checkState(b.c)].rank || a.i - b.i)
    .map(({ c }) => c);
}

/** "9 passed · 2 flagged · 1 couldn't run" (admin.html #d-sum). */
export function checksSummary(checks: readonly Pick<CheckResult, 'status' | 'hardFail'>[]): string {
  const n: Record<CheckState, number> = { hard: 0, fail: 0, na: 0, flag: 0, ok: 0 };
  for (const c of checks) n[checkState(c)]++;
  const failed = n.fail + n.hard;
  return [
    n.ok && `${n.ok} passed`,
    n.flag && `${n.flag} flagged`,
    n.na && `${n.na} couldn't run`,
    failed && `${failed} failed${n.hard ? ` (${n.hard} can't be overruled)` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const SATELLITE: readonly CheckId[] = ['deforestation_overlap', 'ndvi_cultivation', 'ndvi_harvest_window'];
const isSatellite = (id: CheckId) => SATELLITE.includes(id);
const names = (cs: readonly CheckResult[]) => cs.map((c) => `“${CHECK_NAME[c.id]}”`).join(', ');

/**
 * A cap reason (score() `capReasons`, technical-plan §6.2) as a plain sentence for the admin, e.g.
 * `anyUnavailable` → "A satellite check could not run, so a person must look".
 */
export function capReasonSentence(reason: string, checks: readonly CheckResult[]): string {
  if (reason === 'anyFail') {
    const failed = checks.filter((c) => c.status === 'fail');
    return `${failed.length === 1 ? 'A check failed' : 'Some checks failed'} (${names(failed)}), so a person must look`;
  }
  if (reason === 'flag:deforestation_overlap') return 'Some tree cover was lost inside the plot since 2021, so a person must look';
  if (reason === 'flag:yield_plausibility') return 'The season’s harvest is high for this plot, so a person must look';
  if (reason === 'anyUnavailable') {
    const na = checks.filter((c) => c.status === 'unavailable');
    if (na.length > 0 && na.every((c) => isSatellite(c.id))) return 'A satellite check could not run, so a person must look';
    return `A check could not run (${names(na)}), so a person must look`;
  }
  if (reason.startsWith('flag:')) {
    const id = reason.slice(5) as CheckId;
    return `“${CHECK_NAME[id] ?? id}” was flagged, so a person must look`;
  }
  return 'A rule holds this picking for a person to look';
}

/** The score-card "why" line (admin.html #d-why): its lead and the sentences after it. */
export function whyLine(run: { verdict: Verdict; score: number; checks: readonly CheckResult[]; capReasons: readonly string[] }): { lead: string; text: string } {
  const hard = run.checks.filter((c) => c.hardFail);
  if (hard.length > 0) {
    return {
      lead: 'Why it was not accepted:',
      text: `${names(hard)} failed. This rule always means Not accepted and can’t be overruled.`,
    };
  }
  if (run.verdict === 'Rejected') {
    return { lead: 'Why it was not accepted:', text: `The score is under 50, so the checks did not accept this picking.` };
  }
  if (run.verdict === 'Verified') return { lead: 'Why it was accepted:', text: 'The score is 80 or more and no rule holds it for a person.' };
  if (run.capReasons.length === 0) {
    return { lead: 'Why a person needs to look:', text: 'No single check forces this one. The score is under 80, and Verified needs 80 or more, so a person decides.' };
  }
  return { lead: 'Why a person needs to look:', text: run.capReasons.map((r) => `${capReasonSentence(r, run.checks)}.`).join(' ') };
}

/** The queue row icon (admin.html q-bub). */
export type QueueIcon = 'cloud' | 'location' | 'trend' | 'seal' | 'camera' | 'plot' | 'inbox';

const ICON: Record<CheckId, QueueIcon> = {
  signature_valid: 'seal',
  chain_continuity: 'seal',
  photo_uniqueness: 'camera',
  geofence: 'location',
  gps_accuracy: 'location',
  exif_gps_agreement: 'location',
  exif_time_agreement: 'camera',
  movement_plausibility: 'location',
  deforestation_overlap: 'plot',
  ndvi_cultivation: 'cloud',
  ndvi_harvest_window: 'cloud',
  yield_plausibility: 'trend',
};

/** Short admin words for a check that holds or rejects a picking (the queue row's reason line). */
const SHORT: Partial<Record<CheckId, Partial<Record<CheckState, string>>>> = {
  signature_valid: { hard: 'Phone’s seal does not match' },
  chain_continuity: { flag: 'Phone’s seal chain out of order' },
  photo_uniqueness: { hard: 'Photo already used' },
  geofence: { fail: 'Taken outside the plot', flag: 'Taken just outside the plot' },
  gps_accuracy: { fail: 'Location too rough', flag: 'Location accuracy weak' },
  exif_gps_agreement: { fail: 'Photo location far from the phone', flag: 'Photos have no location saved' },
  exif_time_agreement: { fail: 'Photo time far from the picking', flag: 'Photo time off' },
  movement_plausibility: { fail: 'Travel too fast since the last record' },
  deforestation_overlap: { hard: 'Forest cleared on the plot', flag: 'Some forest loss on the plot', na: 'Forest map couldn’t be read' },
  ndvi_cultivation: { fail: 'No year-round canopy seen', na: 'Satellite history too cloudy' },
  ndvi_harvest_window: { fail: 'Little living canopy this month', flag: 'Canopy thin this month', na: 'Satellite picture cloudy' },
  yield_plausibility: { hard: 'Harvest far above this plot’s size', flag: 'Harvest high for this plot', na: 'No harvest reference for this crop' },
};

function shortFor(c: CheckResult): string {
  const s = checkState(c);
  return SHORT[c.id]?.[s] ?? `${CHECK_NAME[c.id]}: ${STATE_VIEW[s].word.toLowerCase()}`;
}

/**
 * The queue row's headline and icon: the first cap reason in admin words (TSK-12.1), or for a
 * hard-failed run the check that decided it. A Needs Review run with no cap is held by its score.
 */
export function headlineOf(run: { verdict: Verdict; score: number; checks: readonly CheckResult[]; capReasons: readonly string[] }): { headline: string; icon: QueueIcon } {
  const pick = (c: CheckResult | undefined) => (c ? { headline: shortFor(c), icon: ICON[c.id] } : undefined);
  const hard = pick(run.checks.find((c) => c.hardFail));
  if (hard) return hard;
  for (const reason of run.capReasons) {
    const c =
      reason === 'anyFail'
        ? run.checks.find((x) => x.status === 'fail')
        : reason === 'anyUnavailable'
          ? run.checks.find((x) => x.status === 'unavailable')
          : reason.startsWith('flag:')
            ? run.checks.find((x) => x.id === reason.slice(5) && x.status === 'flag')
            : undefined;
    const h = pick(c);
    if (h) return h;
  }
  return { headline: `Score ${formatScore(run.score)}, under 80`, icon: 'inbox' };
}

// ── Numbers and times (IST by explicit offset, never the host zone: technical-plan §1) ─────────────

const IST_MS = 330 * 60_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ist = (iso: string) => new Date(Date.parse(iso) + IST_MS);

/** "Wed 24 Sep" in IST. */
export function istDay(iso: string): string {
  const d = ist(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "7:42 am" in IST. */
export function istClock(iso: string): string {
  const d = ist(iso);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** How long a picking has waited: "4 days", "1 day", "5 h", "under an hour". */
export function waited(fromIso: string, now: Date): string {
  const min = Math.max(0, (now.getTime() - Date.parse(fromIso)) / 60_000);
  if (min < 60) return 'under an hour';
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  const days = Math.floor(min / (24 * 60));
  return days === 1 ? '1 day' : `${days} days`;
}

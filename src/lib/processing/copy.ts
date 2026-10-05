import { istDay } from '../certificate/copy';
import { t } from '../i18n';
import { istClock } from '../review/copy';
import { bandFor, isPlaceholderBand, PROCESSES, type MbCrop, type Process } from './config';
import type { ProcessorBatch } from './read';
import { kg1 } from '../format';

// The processor surface's words (Design.md §28.6, §28.7; contract.html screen 6), from the i18n keys
// `processor.*` (en.ts; Kannada drafts in kn.ts marked for native review, like `agreements.*`). Shipped in
// English, like the agreements screens. Plain words; never accusation words: a step is "Within range" or
// "Flagged". The signed evidence sentence (mass-balance.ts) is signed data, not copy, and stays as signed.

export const PROCESS_LABEL: Record<Process, string> = {
  pulping: t('processor.process.pulping'),
  drying: t('processor.process.drying'),
  hulling_parchment: t('processor.process.hulling_parchment'),
  hulling_dry_cherry: t('processor.process.hulling_dry_cherry'),
};

/** The past-tense word for a recorded step ("Hulled"), as the certificate journey says it. */
export const PROCESS_DONE: Record<Process, string> = {
  pulping: t('processor.done.pulping'),
  drying: t('processor.done.drying'),
  hulling_parchment: t('processor.done.hulling_parchment'),
  hulling_dry_cherry: t('processor.done.hulling_dry_cherry'),
};

const CROP: Record<MbCrop, string> = { arabica: t('processor.crop.arabica'), robusta: t('processor.crop.robusta') };
export const cropName = (c: MbCrop): string => CROP[c];

const pct = (n: number): string => String(n);

/** The hint under each process option: the band for this batch's crop, or that it is a placeholder. */
export function processHint(p: Process, crop: MbCrop): string {
  if (p === 'pulping') return t('processor.hint.pulping');
  if (p === 'drying') return t('processor.hint.drying');
  const [min, max] = bandFor(p, crop);
  return t('processor.hint.band', { min: pct(min), max: pct(max), crop: CROP[crop] });
}

/** The band line under the weights, for the chosen process (or before one is chosen). */
export function bandLine(p: Process | null, crop: MbCrop): string {
  if (!p) return t('processor.band.none');
  const [min, max] = bandFor(p, crop);
  const vars = { process: PROCESS_LABEL[p].toLowerCase(), crop: CROP[crop], min: pct(min), max: pct(max) };
  return isPlaceholderBand(p) ? t('processor.band.placeholder', vars) : t('processor.band.usual', vars);
}

export const PROCESS_OPTIONS = PROCESSES;

/** "1 Oct 2026, 10:05 am" in IST. */
export const istWhen = (iso: string): string => `${istDay(iso)}, ${istClock(iso)}`;
/** "30 Sep" in IST. */
export const istShort = (iso: string): string => istDay(iso).replace(/ \d{4}$/, '');

export type RowStatus = { cls: 'ok' | 'check' | 'na'; text: string };

/** A list row's status line (§28.7 "Statuses and their marks"). */
export function rowStatus(b: ProcessorBatch): RowStatus {
  if (b.handedOn) return { cls: 'ok', text: t('processor.row.handedOn', { org: b.handedOn.toOrgName }) };
  if (!b.step) return { cls: 'na', text: t('processor.row.ready') };
  const done = PROCESS_DONE[b.step.process];
  return b.step.status === 'ok'
    ? { cls: 'ok', text: t('processor.row.ok', { done }) }
    : { cls: 'check', text: t('processor.row.flag', { done, ratio: b.step.ratio.toFixed(1) }) };
}

/** The detail's chip. */
export function detailChip(b: ProcessorBatch): RowStatus {
  if (b.handedOn) return { cls: 'ok', text: t('processor.chip.handedOn') };
  if (!b.step) return { cls: 'na', text: t('processor.chip.withYou') };
  return b.step.status === 'ok' ? { cls: 'ok', text: t('processor.chip.within') } : { cls: 'check', text: t('processor.chip.flagged') };
}

/** "3 pickings" / "1 picking". */
export const pickingsText = (n: number): string => t(n === 1 ? 'processor.detail.picking' : 'processor.detail.pickings', { n });

/** Refusals that retrying cannot fix: the batch changed under this page (for example in another tab). */
export type StaleRefusal = 'already_recorded' | 'not_held' | 'no_step' | 'not_found';
const STALE: Record<StaleRefusal, { b: string; p: string }> = {
  already_recorded: { b: t('processor.refused.alreadyRecordedB'), p: t('processor.refused.alreadyRecordedP') },
  not_held: { b: t('processor.refused.notHeldB'), p: t('processor.refused.notHeldP') },
  no_step: { b: t('processor.refused.noStepB'), p: t('processor.refused.noStepP') },
  not_found: { b: t('processor.refused.notFoundB'), p: t('processor.refused.notFoundP') },
};

/**
 * The words for a refusal that retrying cannot fix, shown with Reload and never with "Try again" (TKT-26
 * quality review minor 3). Null for anything else, which keeps the generic action error and its retry.
 */
export const staleRefusal = (reason: string): { b: string; p: string } | null => (Object.hasOwn(STALE, reason) ? STALE[reason as StaleRefusal] : null);

export const COPY = {
  title: t('processor.title'),
  sub: t('processor.sub'),
  eyebrow: t('processor.eyebrow'),
  loading: t('processor.loading'),
  emptyH: t('processor.emptyH'),
  emptyP: t('processor.emptyP'),
  errorH: t('processor.errorH'),
  errorP: t('processor.errorP'),
  retry: t('processor.retry'),
  reload: t('processor.reload'),
  back: t('processor.back'),
  pick: t('processor.pick'),
  detailLabel: t('processor.detailLabel'),
  railLabel: t('processor.railLabel'),
  roleLabel: (org: string) => org,
  recordH: t('processor.recordH'),
  processLegend: t('processor.processLegend'),
  inputLabel: t('processor.inputLabel'),
  inputHint: t('processor.inputHint'),
  outputLabel: t('processor.outputLabel'),
  outputHint: t('processor.outputHint'),
  signedNote: t('processor.signedNote'),
  record: t('processor.record'),
  recording: t('processor.recording'),
  recordErrB: t('processor.recordErrB'),
  recordErrP: t('processor.recordErrP'),
  weightName: t('processor.weightName'),
  nothingRefused: t('processor.nothingRefused'),
  handH: t('processor.handH'),
  buyerLabel: t('processor.buyerLabel'),
  chooseBuyer: t('processor.chooseBuyer'),
  handNote: t('processor.handNote'),
  handOn: t('processor.handOn'),
  handingOn: (buyer: string) => t('processor.handingOn', { buyer }),
  handErrB: t('processor.handErrB'),
  handErrP: t('processor.handErrP'),
  recorded: t('processor.recorded'),
  handedMeta: (by: string, org: string, when: string) => t('processor.handedMeta', { by, org, when }),
  noBuyers: t('processor.noBuyers'),
  signOut: t('processor.signOut'),
  kg: (kg: number) => t('processor.kg', { kg: kg1(kg) }),
  rowId: (id: string, crop: string) => t('processor.row.id', { id, crop }),
  rowFrom: (org: string, when: string) => t('processor.row.from', { org, when }),
  handedOnTo: (org: string) => t('processor.row.handedOn', { org }),
  detailEyebrow: (org: string) => t('processor.detail.eyebrow', { org }),
  detailMeta: (v: { crop: string; pickings: string; kg: string; when: string; org: string }) => t('processor.detail.meta', v),
  stepH: (process: string, when: string) => t('processor.detail.stepH', { process, when }),
  stepSum: (inKg: number, outKg: number) => t('processor.detail.stepSum', { in: kg1(inKg), out: kg1(outKg) }),
  metaList: t('processor.meta.list'),
} as const;

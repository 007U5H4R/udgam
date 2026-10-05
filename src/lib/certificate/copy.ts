import type { VerifyStep } from '../ledger/proof';

// The public certificate's words (TKT-16), ported from .design/exploration/final/verify.html. The page is
// English only: its readers are importers, auditors and consumers abroad (Design.md §25), so these are
// not i18n keys (kn.ts carries only farmer- and agent-facing keys). Pending HR2 copy approval with the
// rest of the product copy. Organic status always uses the shared AttestationLine wording (DISC4).

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const certCopy = {
  kind: 'Public certificate',
  /** The batch QR card on the admin and buyer batch pages (TSK-16.7). */
  qrTitle: 'Certificate QR code',
  qrPrint: 'Print QR',
  /** Beside a failing step's plain words: "(step <name>…)". */
  stepWord: 'step',
  eyebrow: (batchId: string) => `Batch ${batchId}`,
  headline: (kg: string, crop: string, farms: number, district: string) => `${kg} kg of ${crop} cherry from ${farms} ${plural(farms, 'farm', 'farms')} in ${district}`,
  meta: (region: string, window: string | null) => (window ? `${region} · harvested ${window}` : region),

  proof: {
    label: 'Proof result',
    verifiedTitleLit: 'Verified',
    verifiedTitleRest: ' on this device just now',
    verifiedLine: (n: number) => `${n} ${plural(n, 'record', 'records')} checked, all match the sealed ledger.`,
    sealLine: (ids: number[], kid8: string) => `${ids.length === 1 ? `Checkpoint ${ids[0]}` : `Checkpoints ${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`} signed by key ${kid8}.`,
    loading: (k: number, n: number) => `Checking ${k} of ${n} records…`,
    loadingLine: 'Your browser is checking each record itself.',
    barLabel: 'Records checked',
    mismatchTitle: 'Does not match',
    mismatchRecord: (k: number, n: number) => `Record ${k} of ${n} does not match the sealed ledger.`,
    mismatchSeal: 'The seal on these records does not match Udgam’s published key.',
    mismatchLink: 'This link does not match the sealed batch.',
    mismatchSet: 'Records are missing from this batch.',
    mismatchFormat: 'The proof on this page is damaged.',
    whatFailed: 'What failed',
    whatItMeans: 'What it means',
    means: 'Something here was changed after the batch was sealed, or this link is damaged. Do not rely on this page as it is.',
    whatToDo: 'What to do',
    todo: 'Ask the seller for a new link.',
    checkAgain: 'Check again',
    unconfirmedLead: 'The details below are what the seller published.',
    unconfirmedRest: ' Until the check passes, they are not confirmed.',
    unavailableTitle: 'Could not check yet',
    unavailableLine: 'Your browser could not fetch Udgam’s public key, so nothing on this page is confirmed yet. Check your connection and try again.',
    how: 'How this was checked',
    howBody1: (n: number) =>
      `This page did not ask Udgam whether it is genuine. Your browser took the ${n} ${plural(n, 'record', 'records')} of this batch, worked out each record’s fingerprint again, and compared it with the fingerprints written into the ledger’s signed seal.`,
    howBody2: 'It then checked the seal’s signature with Udgam’s public key. If even one number in one record had changed, its fingerprint would not match.',
    publicKey: 'Udgam public key',
    keyLine: (kid8: string) => `Key fingerprint ${kid8}`,
    limitsLink: 'What this can’t prove',
    recordRef: (seq: number) => `ledger record ${seq}`,
    checkpointRef: (id: number) => `checkpoint ${id}`,
    expectedKey: (kid8: string) => `expected key ${kid8}`,
  },

  /** Plain words per failing step (docs/proof-feed.md §10); the step's own name is shown beside them. */
  steps: {
    format: 'The proof data is not in the published format',
    'unknown-key': 'The seal was not signed with Udgam’s published key',
    'checkpoint-signature': 'The seal’s signature does not verify',
    'payload-hash': 'A record’s contents changed after it was sealed',
    'entry-hash': 'A record’s details changed after it was sealed',
    'merkle-path': 'A record is not where the seal says it is',
    'payload-signature': 'A signed decision in the records does not verify',
    'short-hash': 'The link’s batch code does not match the sealed batch',
    'closure-incomplete': 'Records of this batch are missing',
  } satisfies Record<VerifyStep, string>,

  map: {
    heading: 'Where it was grown',
    label: (n: number, place: string) => `Map of the ${n} farm ${plural(n, 'plot', 'plots')} in this batch in ${place}. Each plot is drawn by its boundary line.`,
    farms: 'Farms in this batch',
    farm: (producerId: string) => `Farm ${producerId}`,
    pickings: (n: number, kg: string) => `${n} ${plural(n, 'picking', 'pickings')} · ${kg} kg`,
    noForest: 'No forest-loss result on record for this plot',
  },

  journey: {
    heading: 'How it got here',
    harvested: 'Harvested',
    farmsIn: (n: number, district: string) => `${n} ${plural(n, 'farm', 'farms')} in ${district}`,
    checked: 'Checked',
    pickings: (n: number) => `${n} ${plural(n, 'picking', 'pickings')}`,
    checkedWhere: 'Each at its plot, when it was picked',
    batched: 'Batched',
    by: (org: string) => `By ${org}`,
    handed: 'Handed to buyer',
    to: (org: string) => `To ${org}`,
  },

  origin: {
    heading: 'Origin',
    region: 'Region',
    variety: 'Variety',
    farms: 'Farms',
    window: 'Harvest window',
    quantity: 'Quantity',
    kgCherry: (kg: string) => `${kg} kg cherry`,
  },

  entries: {
    heading: 'Harvest entries',
    listLabel: (n: number) => `${n} harvest ${plural(n, 'entry', 'entries')}`,
    number: '#',
    date: 'Date',
    farm: 'Farm',
    cherry: 'Cherry',
    check: 'Check',
    total: 'Total',
    kg: (kg: string) => `${kg} kg`,
    seeAll: (n: number) => `See all checks (${n} more)`,
    override: (word: string) => `Decided by the office: ${word}`,
    reason: 'Reason',
    checking: 'Checking',
    notConfirmed: 'Not confirmed',
    doesNotMatch: 'Does not match',
  },

  organic: {
    heading: 'Organic',
    partOf: (plots: string) => `Covers ${plots} only, not every farm in this batch.`,
    notChecked: 'Not checked by satellite.',
  },

  files: {
    heading: 'Files',
    geojson: 'Download EUDR map file (GeoJSON)',
    print: 'Print certificate',
  },

  limits: {
    heading: 'What this can’t prove',
    trust:
      'Your browser checked these records against the key Udgam publishes at its own address. If someone controlled Udgam’s server and replaced both the records and that key, this check could not tell. It proves the records were not changed after they were sealed; it cannot prove that a weight or a location was true when it was recorded.',
    gps: 'Each picking was recorded by the field agent’s phone inside its farm’s mapped plot. A phone that is inside the plot is not proof that the cherries in the photo were picked there.',
    photos: 'Photos are checked against every photo seen before, by their exact bytes. A photo that was re-saved or edited has new bytes, so a re-used photo can pass as new.',
    salami: 'Each picking is checked against the plot’s expected yield for the season. Many small pickings, each normal on its own, are only caught once their season total runs past that bound.',
    clearing:
      'Satellite forest-loss data (Global Forest Watch) counts tree cover lost since 2021. It cannot tell a legal pruning or shade-tree thinning from clearing, and it cannot see loss smaller than about one satellite pixel.',
    declared: 'Anything that was only declared is shown as declared, not tested: the plot boundaries drawn at registration and the organic certificate.',
  },

  footer: (batchId: string) => `Udgam · public certificate for batch ${batchId} · Farms are shown by ID only; no farmer names or phone numbers are published.`,

  notFound: {
    title: 'Batch not found',
    body: 'This link does not match any sealed batch. Check that the whole link was copied, or scan the QR code again.',
    todo: 'If it still does not open, ask the seller for a new link.',
  },
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** The IST calendar date of an ISO-8601 UTC time, as {d, m, y} (explicit offset arithmetic, never the host zone). */
function istParts(iso: string): { d: number; m: number; y: number } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + IST_OFFSET_MS);
  return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() };
}

/** "2 Sep 2026" (IST). */
export function istDay(iso: string): string {
  const p = istParts(iso);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : '';
}

/** "2–27 Sep 2026", "28 Aug – 3 Sep 2026", "30 Dec 2025 – 2 Jan 2026" or one day (IST). */
export function istRange(fromIso: string, toIso: string): string {
  const a = istParts(fromIso);
  const b = istParts(toIso);
  if (!a || !b) return '';
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? `${a.d} ${MONTHS[a.m]} ${a.y}` : `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

/** Today's IST calendar date `YYYY-MM-DD` for `now` (the attestation line's validity). */
export const istToday = (now: Date): string => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Kilograms with one decimal ("612.0"), tabular in the tables (verify.html). */
export const kg1 = (kg: number): string => (Math.round(kg * 10) / 10).toFixed(1);

/** Kilograms, whole numbers bare ("612"), else one decimal (the headline). */
export const kgShort = (kg: number): string => (Number.isInteger(kg) ? String(kg) : kg1(kg));

/** Hectares with one decimal ("1.8 ha"). */
export const ha1 = (ha: number | null): string => (ha === null ? '' : `${(Math.round(ha * 10) / 10).toFixed(1)} ha`);

/** The first 8 characters of a key id (the fingerprint shown on the page). */
export const kid8 = (kid: string): string => kid.slice(0, 8);

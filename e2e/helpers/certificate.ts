import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { E2E_DATA_DIR } from './tracer';

// Shared helpers for the certificate specs (TKT-16): seeding a batch (seed-certificate.ts), the proof
// panel's states, and the page-wide scans (no green, no horizontal scroll, axe).

export type SeededCertificate = { batchId: string; shortHash: string; producerIds: string[]; plotIds: string[]; eventIds: string[]; totalKg: number };

/** TSK-16.9 sentinels (EVAL-084): written only to the farmers and organisations tables. */
export const SENTINELS = { name: 'Zzsentinel Farmer', identifier: 'ID-SENTINEL-9999', phone: '9999988888' } as const;

/** Seed one certificate-ready batch into the e2e database (new IDs every call). */
export function seedCertificate(opts: { events?: number; plots?: number; transfer?: boolean; attestation?: boolean; sentinel?: boolean } = {}): SeededCertificate {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent', REMOTE_SENSING_PROVIDER: 'fixture' };
  delete env.DATABASE_URL;
  delete env.LEDGER_KEY_PATH;
  const args = ['e2e/helpers/seed-certificate.ts', '--events', String(opts.events ?? 3), '--plots', String(opts.plots ?? 3)];
  if (opts.transfer === false) args.push('--no-transfer');
  if (opts.attestation === false) args.push('--no-attestation');
  if (opts.sentinel) args.push('--sentinel');
  const out = execFileSync('./node_modules/.bin/tsx', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededCertificate;
}

export const certificateUrl = (s: Pick<SeededCertificate, 'batchId' | 'shortHash'>, extra = '') => `/verify/${s.batchId}?h=${s.shortHash}${extra}`;

/** Wait until the proof panel reaches a final state (body[data-state]); returns it. */
export async function proofFinalState(page: Page, timeout = 20_000): Promise<string> {
  await page.waitForFunction(() => ['verified', 'mismatch', 'unavailable'].includes(document.body.dataset.state ?? ''), undefined, { timeout });
  return page.evaluate(() => document.body.dataset.state!);
}

/**
 * Every rendered element (and its ::before/::after) whose colour, background, border, fill, stroke,
 * shadow, filter or outline uses the --ok green (#7FE3A6 / #9CF0BF). Hidden elements are skipped: the
 * question is what renders (TC-065).
 */
export async function greenOnPage(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const GREEN = /rgba?\(\s*(127,\s*227,\s*166|156,\s*240,\s*191)\b/;
    const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'fill', 'stroke', 'box-shadow', 'filter', 'outline-color', 'text-decoration-color', 'stop-color'];
    const hits: string[] = [];
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && (el.getClientRects().length > 0 || el instanceof SVGElement);
    };
    const inHidden = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return true;
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || !visible(el) || inHidden(el)) continue;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const s = getComputedStyle(el, pseudo);
        if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
        for (const p of PROPS) {
          const v = s.getPropertyValue(p);
          if (GREEN.test(v)) hits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.getAttribute('class') ?? '').split(' ')[0]}${pseudo ?? ''} ${p}: ${v}`);
        }
      }
    }
    // The ground glow (globals.css body::before)
    const g = getComputedStyle(document.body, '::before').getPropertyValue('background-image');
    if (GREEN.test(g)) hits.push(`body::before background-image: ${g}`);
    return hits;
  });
}

export async function noHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}

export async function noSeriousAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { summarizeLatency, type LatencySummary } from '../scorers/latency';
import { applyReferenceProfile, EV9_NETWORK, S4_CPU_THROTTLE } from './network';

// S4 (EVAL-071, EV10, TSK-16.10): in-browser certificate verification time. Each run is a cold load in a
// fresh browser context (empty cache) at 375 × 812 under the EV9 network and a 4× CPU slowdown; the time
// is `performance.getEntriesByName('proof-final')[0].startTime` (navigation start = 0), which the proof
// panel marks when it reaches its final state. A run that does not end `verified` is a failure whatever its
// time. Gate: every run under 3 s.

export const S4_THRESHOLD_MS = 3000;
const PRE_INSTALLED = '/opt/pw-browsers/chromium';

/** `errors`: page errors and console errors of the run (why a run did not end verified). */
export type S4Run = { run: number; ms: number | null; finalState: string; errors: string[] };
export type S4Result = {
  gate: 'S4';
  case: 'EVAL-071';
  target: string;
  path: string;
  profile: { viewport: { width: number; height: number }; network: typeof EV9_NETWORK; cpuThrottle: number; cache: 'cold (fresh context per run)' };
  runs: S4Run[];
  summary: LatencySummary | null;
  pass: boolean;
};

export async function runS4(o: { target: string; path: string; runs: number; timeoutMs?: number }): Promise<S4Result> {
  const executablePath = process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const runs: S4Run[] = [];
  try {
    for (let i = 1; i <= o.runs; i++) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`console: ${m.text()}`);
        });
        const cdp = await context.newCDPSession(page);
        await applyReferenceProfile(cdp, { cpuThrottle: S4_CPU_THROTTLE });
        await page.goto(new URL(o.path, o.target).toString(), { waitUntil: 'commit' });
        let finalState = 'timeout';
        try {
          await page.waitForFunction(() => ['verified', 'mismatch'].includes(document.body?.dataset.state ?? '') || performance.getEntriesByName('proof-final').length > 0, undefined, {
            timeout: o.timeoutMs ?? 30_000,
          });
          finalState = await page.evaluate(() => document.body.dataset.state ?? 'none');
        } catch {
          // stays "timeout"
        }
        const ms = await page.evaluate(() => performance.getEntriesByName('proof-final')[0]?.startTime ?? null).catch(() => null);
        if (finalState === 'timeout') errors.push(`state at timeout: ${await page.evaluate(() => document.body?.dataset.state ?? 'none').catch(() => 'unreadable')}`);
        runs.push({ run: i, ms: ms === null ? null : Math.round(ms), finalState, errors: errors.slice(0, 10) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const times = runs.filter((r) => r.ms !== null).map((r) => r.ms!);
  const summary = times.length > 0 ? summarizeLatency(times, S4_THRESHOLD_MS) : null;
  const allVerified = runs.every((r) => r.finalState === 'verified' && r.ms !== null);
  return {
    gate: 'S4',
    case: 'EVAL-071',
    target: o.target,
    path: o.path,
    profile: { viewport: { width: 375, height: 812 }, network: EV9_NETWORK, cpuThrottle: S4_CPU_THROTTLE, cache: 'cold (fresh context per run)' },
    runs,
    summary,
    pass: allVerified && !!summary?.pass,
  };
}

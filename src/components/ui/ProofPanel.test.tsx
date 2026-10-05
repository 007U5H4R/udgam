// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeFeedForEmbed } from '../../lib/certificate/embed';
import type { ProofFeedV1 } from '../../lib/ledger/proof';
import { ProofPanel } from './ProofPanel';
import { resetProofState } from './proof-state';

// TSK-16.3 · TC-065 (component half): the proof panel verifies the embedded feed in the browser with the
// published key, shows "Checking k of n records…" on the way, ends in verified with the checkpoint and
// key, or in mismatch naming the step and the record; a live region carries each state; body[data-state]
// follows it; a mismatch sends one beacon with the step only.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;
const KEYS = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.keys.json'), 'utf8')) as { keys: { kid: string }[] };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom has no SubtleCrypto: the browser's WebCrypto is Node's here (the same API).
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

let root: Root;
let container: HTMLElement;
let beacon: ReturnType<typeof vi.fn>;
let states: string[];

function mount(feed: ProofFeedV1, keyResponse: () => Promise<Response> = async () => new Response(JSON.stringify(KEYS), { status: 200 })) {
  document.body.innerHTML = `<script type="application/json" id="proof-feed">${serializeFeedForEmbed(feed)}</script><div id="root"></div>`;
  container = document.getElementById('root')!;
  vi.stubGlobal('fetch', vi.fn(keyResponse));
  root = createRoot(container);
  act(() => root.render(<ProofPanel entryCount={feed.entries.length} batchId={feed.batchId} />));
  // record every text the live region shows
  const status = () => container.querySelector('[role="status"]')?.textContent ?? '';
  states = [status()];
  new MutationObserver(() => {
    const t = status();
    if (t !== states.at(-1)) states.push(t);
  }).observe(container, { subtree: true, childList: true, characterData: true });
}

async function settle(pred: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out; body state ${document.body.dataset.state}, text: ${container.textContent}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

/** Every beacon body sent so far, parsed (all go to /api/telemetry). */
async function sent(): Promise<unknown[]> {
  const calls = beacon.mock.calls as [string, Blob][];
  expect(calls.every(([url]) => url === '/api/telemetry')).toBe(true);
  return Promise.all(calls.map(async ([, blob]) => JSON.parse(await blob.text()) as unknown));
}
const VIEWED = { event: 'certificate.viewed', batchId: FEED.batchId };

const final = () => ['verified', 'mismatch'].includes(document.body.dataset.state ?? '');

beforeEach(() => {
  resetProofState();
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  performance.clearMarks();
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('<ProofPanel> (TSK-16.3, TC-065)', () => {
  it('verifies the intact feed: "Verified on this device just now", the record count, checkpoint and key', async () => {
    mount(FEED);
    expect(container.textContent).toContain('Checking 0 of 16 records…');
    await settle(final);
    expect(document.body.dataset.state).toBe('verified');
    const text = container.textContent!;
    expect(text).toContain('Verified on this device just now');
    expect(text).toContain('16 records checked, all match the sealed ledger.');
    expect(text).toContain(`Checkpoint 1 signed by key ${KEYS.keys[0]!.kid.slice(0, 8)}.`);
    expect(container.querySelector('.proof')).not.toBeNull();
    expect(performance.getEntriesByName('proof-final')).toHaveLength(1);
    // TASK-17 fix round 1: verification start is marked too, so §18's verify budget is measured on its own
    expect(performance.getEntriesByName('proof-start')).toHaveLength(1);
    // one view beacon per page view (batch id only), no failure beacon
    expect(await sent()).toEqual([VIEWED]);
    // the key came from the well-known path, never from the feed
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/.well-known/udgam-ledger-key');
  });

  it('shows the real progress on the way ("Checking k of n records…") in a live region', async () => {
    mount(FEED);
    await settle(final);
    expect(states[0]).toContain('Checking 0 of 16 records…');
    expect(states.some((s) => /Checking (\d+) of 16 records…/.test(s) && !s.includes('Checking 0 of'))).toBe(true);
    expect(states.at(-1)).toContain('Verified on this device just now');
  });

  it('a changed payload field: mismatch at payload-hash naming the record, body state mismatch, one beacon with the step', async () => {
    const f = structuredClone(FEED);
    const h = f.entries.find((e) => e.kind === 'harvest_event')!;
    (h.payload.capture as { cherryKg: number }).cherryKg += 10;
    mount(f);
    await settle(final);
    expect(document.body.dataset.state).toBe('mismatch');
    const box = container.querySelector('[data-testid="proof-mismatch"]')!;
    expect(box.getAttribute('data-step')).toBe('payload-hash');
    expect(box.getAttribute('data-seq')).toBe(String(h.seq));
    const text = container.textContent!;
    expect(text).toContain('Does not match');
    expect(text).toContain(`Record ${f.entries.indexOf(h) + 1} of 16 does not match the sealed ledger.`);
    expect(text).toContain('payload-hash');
    expect(text).toContain(`ledger record ${h.seq}`);
    expect(text).not.toContain('Verified on this device');
    expect(container.querySelector('[data-mark="ok"]')).toBeNull();
    expect(await sent()).toEqual([VIEWED, { event: 'certificate.proof_failed', step: 'payload-hash', batchId: FEED.batchId }]);
  });

  it('"Check again" runs the verification again', async () => {
    const f = structuredClone(FEED);
    f.shortHash = f.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    mount(f);
    await settle(final);
    expect(container.querySelector('[data-testid="proof-mismatch"]')!.getAttribute('data-step')).toBe('short-hash');
    const calls = vi.mocked(fetch).mock.calls.length;
    act(() => (container.querySelector('#check-again') as HTMLButtonElement).click());
    expect(document.body.dataset.state).toBe('loading');
    await settle(final);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 1);
    expect(document.body.dataset.state).toBe('mismatch');
    // the view is counted once per page view, not per check
    expect((await sent()).filter((b) => (b as { event: string }).event === 'certificate.viewed')).toHaveLength(1);
  });

  it('a key it cannot fetch is not a mismatch: nothing is confirmed, no green, a retry', async () => {
    mount(FEED, async () => new Response('{"error":"unavailable"}', { status: 503 }));
    await settle(() => container.textContent!.includes('Could not check yet'));
    expect(document.body.dataset.state).toBe('loading');
    expect(container.querySelector('[data-mark="ok"]')).toBeNull();
    expect(container.querySelector('#check-again')).not.toBeNull();
    expect(await sent()).toEqual([VIEWED]);
  });

  it('removes body[data-state] when it unmounts', async () => {
    mount(FEED);
    await settle(final);
    act(() => root.unmount());
    expect(document.body.dataset.state).toBeUndefined();
    root = createRoot(container); // afterEach unmounts again
  });
});

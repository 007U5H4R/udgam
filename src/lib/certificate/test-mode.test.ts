import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyFeed, type ProofFeedV1, type VerifierKey } from '../ledger/proof';
import { EXPECTED_STEP, SUITE_VECTOR } from '../ledger/testing/tamper';
import { TAMPER_VARIANTS, tamperedFeed, tamperFromSearchParams } from './test-mode';

// TSK-16.8: the tamper mode exists only on the Playwright server (E2E=1) and never in a production
// deployment; each variant makes the browser's verifier fail at the documented step.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;
const KEYS = (JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.keys.json'), 'utf8')) as { keys: VerifierKey[] }).keys;

describe('tamperFromSearchParams (TSK-16.8)', () => {
  it('a production deployment always gets null, whatever is asked', () => {
    for (const v of [...TAMPER_VARIANTS, 'payload-field']) {
      expect(tamperFromSearchParams({ __tamper: v }, { NODE_ENV: 'production' })).toBeNull();
      expect(tamperFromSearchParams({ __tamper: v }, { NODE_ENV: 'production', E2E: '0' })).toBeNull();
    }
  });

  it('development and test without E2E=1 get null too', () => {
    expect(tamperFromSearchParams({ __tamper: 'payload-field' }, { NODE_ENV: 'development' })).toBeNull();
    expect(tamperFromSearchParams({ __tamper: 'payload-field' }, { NODE_ENV: 'test', E2E: '0' })).toBeNull();
  });

  it('the Playwright server (E2E=1) gets the variant; unknown values and arrays get null', () => {
    const e2e = { NODE_ENV: 'production', E2E: '1' };
    for (const v of TAMPER_VARIANTS) expect(tamperFromSearchParams({ __tamper: v }, e2e)).toBe(v);
    expect(tamperFromSearchParams({}, e2e)).toBeNull();
    expect(tamperFromSearchParams({ __tamper: 'drop_batch_created' }, e2e)).toBeNull();
    expect(tamperFromSearchParams({ __tamper: ['payload-field', 'x'] }, e2e)).toBeNull();
  });
});

describe('tamperedFeed (TSK-16.8)', () => {
  it('the intact feed verifies; each variant fails at its documented step; the input is untouched', async () => {
    expect(await verifyFeed(FEED, KEYS)).toMatchObject({ ok: true, entries: 16 });
    const before = structuredClone(FEED);
    for (const v of TAMPER_VARIANTS) {
      const forged = await tamperedFeed(FEED, KEYS, v);
      const out = await verifyFeed(JSON.parse(JSON.stringify(forged)), KEYS);
      expect(out, v).toMatchObject({ ok: false, step: EXPECTED_STEP[SUITE_VECTOR[v]] });
    }
    expect(FEED).toEqual(before);
  });
});

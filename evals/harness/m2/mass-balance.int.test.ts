import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { publishedKeys } from '../../../src/lib/ledger/keys';
import { verifyFeed } from '../../../src/lib/ledger/proof';
import { runMassBalanceFlow } from './mass-balance';

// EVAL-100–102 (milestone M2, suite integration; TC-086): the mass-balance flows through the processing
// action (technical-plan TSK-26.4). Each test is titled with its EVAL ID and asserts the case's expected
// behaviour and every failure condition in evals/eval-dataset.json. The certificate-journey half of
// EVAL-100 is asserted here on the view model and end to end in e2e/m2-processing.spec.ts.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-m2-mb-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

describe('M2 mass balance (TSK-26.4)', () => {
  it('EVAL-100: pulping 1,000 kg inside the band is signed and anchored with no flag', async () => {
    const f = await runMassBalanceFlow(t.db, 'EVAL-100');
    // failure condition "Flag raised inside the band"
    expect(f.step.status).toBe('ok');
    expect(f.row).toMatchObject({ status: 'ok', process: 'pulping', inputKg: 1000, outputKg: 420, ratio: 42, bandMin: 35, bandMax: 50, configVersion: 'mb-1' });
    // failure condition "Step not anchored": the row's anchor is a processing_step entry carrying the signed step
    expect(f.row.anchorSeq).toBe(f.step.anchorSeq);
    expect(f.entry.kind).toBe('processing_step');
    expect(f.entry.payload).toMatchObject({ batchId: f.world.batchId, status: 'ok', ratio: 42, band: [35, 50], signature: f.row.signature, kid: f.row.keyId });
    expect(f.feed.entries.some((e) => e.kind === 'processing_step' && e.seq === f.step.anchorSeq)).toBe(true);
    expect(f.feedOk).toBe(true);
  }, 60_000);

  it('EVAL-101: output below the band is flagged with the ratio and the band', async () => {
    const f = await runMassBalanceFlow(t.db, 'EVAL-101');
    expect(f.row.status).toBe('flag'); // failure condition "No flag"
    // failure condition "Evidence without the ratio and band"
    expect(f.row.evidence).toBe('Output 420.0 kg is 70.0% of input 600.0 kg (expected 75–85% for hulling parchment).');
    expect(f.entry.payload).toMatchObject({ status: 'flag', evidence: f.row.evidence });
    expect(f.feedOk).toBe(true); // a flagged step is recorded and verifies: nothing is refused
  }, 60_000);

  it('EVAL-102: output above input is flagged as a gain, and the batch cannot be presented as unflagged', async () => {
    const f = await runMassBalanceFlow(t.db, 'EVAL-102');
    expect(f.row.status).toBe('flag'); // failure condition "No flag"
    expect(f.row.evidence).toBe('Output 650.0 kg is 108.3% of input 600.0 kg, a gain in weight (expected 75–85% for hulling parchment).');
    expect(f.feedOk).toBe(true);
    // Presenting the step as unflagged changes signed, hashed bytes: the certificate's verifier refuses it.
    const forged = structuredClone(f.feed);
    const step = forged.entries.find((e) => e.kind === 'processing_step')!;
    step.payload = { ...step.payload, status: 'ok', outputKg: 480, ratio: 80, evidence: 'Output 480.0 kg is 80.0% of input 600.0 kg (expected 75–85% for hulling parchment).' };
    expect(await verifyFeed(forged, (await publishedKeys()).keys)).toMatchObject({ ok: false, step: 'payload-hash' });
    // and leaving the step out of the feed hides nothing the server serves: the served feed always carries it
    expect(f.feed.entries.filter((e) => e.kind === 'processing_step')).toHaveLength(1);
  }, 60_000);
});

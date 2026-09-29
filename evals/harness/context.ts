import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPair } from '../../src/lib/crypto';
import { FixtureProvider, type ProviderFault, type RsProfile } from '../../src/lib/remote-sensing/fixture';
import type { RemoteSensingProvider } from '../../src/lib/remote-sensing/types';
import type { VerifyContext } from '../../src/lib/verification/types';
import type { Dataset } from './dataset';
import { PLOTS_DIR, RS_DIR, type PlotFeature } from './fixtures';

// The harness world every case is built in (technical-plan §13; evaluation-plan §7.2): committed plot
// and remote-sensing fixtures, the dataset devices with per-run keys, the placeholder yield reference
// and a fixed server receipt time. Nothing here is shared mutable state: each case gets its own
// context and its own provider (TKT-07 extends buildRemoteSensing with the cache wrapper).

/** Fixed server receipt time for every case: 8 Dec 2026, 11:00 IST, in the Kodagu harvest. */
export const SERVER_RECEIVED_AT = '2026-12-08T05:30:00.000Z';

/** D-A2's revocation (before every case's receipt time). */
export const REVOKED_AT = '2026-11-20T04:30:00.000Z';

/**
 * Placeholder yield reference row (technical-plan §22 TSK-03.4). Cases are written in multiples of U,
 * so they stay valid when TKT-09 seeds the Coffee Board row; provenance flags it `placeholder`.
 */
export const PLACEHOLDER_YIELD_REFERENCE: VerifyContext['yieldReference'] = { maxKgHa: 1000, cherryToCleanRatio: 0.2, source: 'placeholder' };

/** Crop for every fixture plot (the dataset names none; the yield row is a placeholder either way). */
export const FIXTURE_CROP = 'arabica' as const;

export type HarnessInputs = {
  dataset: Dataset;
  plots: Record<string, PlotFeature>;
  profiles: Record<string, RsProfile>;
};

/** The committed fixtures for every dataset plot (evals/fixtures/{plots,remote-sensing}). */
export function loadHarnessInputs(dataset: Dataset): HarnessInputs {
  const plots: Record<string, PlotFeature> = {};
  const profiles: Record<string, RsProfile> = {};
  for (const { id } of dataset.fixtures.plots) {
    plots[id] = JSON.parse(readFileSync(join(PLOTS_DIR, `${id}.geojson`), 'utf8')) as PlotFeature;
    const { plotId, forestLoss, ndviHistory, ndviWindow } = JSON.parse(readFileSync(join(RS_DIR, `${id}.json`), 'utf8')) as RsProfile;
    profiles[id] = { plotId, forestLoss, ndviHistory, ndviWindow };
  }
  return { dataset, plots, profiles };
}

/** The fixture files that feed a run, for the provenance fixture-set hash. */
export function fixtureFiles(dataset: Dataset): string[] {
  return dataset.fixtures.plots.flatMap(({ id }) => [join(PLOTS_DIR, `${id}.geojson`), join(RS_DIR, `${id}.json`)]);
}

export type DeviceKey = { pair: CryptoKeyPair; publicJwk: JsonWebKey };
export type DeviceKeys = Record<string, DeviceKey>;

/** A fresh P-256 key for every dataset device (D-A1 … K-X), generated per run (technical-plan §13). */
export async function generateDeviceKeys(dataset: Dataset): Promise<DeviceKeys> {
  const keys: DeviceKeys = {};
  for (const d of dataset.fixtures.devices) {
    const pair = await generateKeyPair(false);
    keys[d.id] = { pair, publicJwk: await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey) };
  }
  return keys;
}

/** A case's own remote-sensing provider: the fixture adapter with the case's injected faults. */
export function buildRemoteSensing(profiles: Record<string, RsProfile>, faults: ProviderFault[]): RemoteSensingProvider {
  return new FixtureProvider({ profiles, faults });
}

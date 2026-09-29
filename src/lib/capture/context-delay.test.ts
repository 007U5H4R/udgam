import { describe, expect, it, vi } from 'vitest';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import { withE2eDelay } from './context';

// TSK-10.10: the test-only NDVI delay (E2E_FIXTURE_DELAY_MS) exists only when E2E=1 (technical-plan §1),
// read through env.ts, and only ever slows the fixture provider (TASK-11 fix round 1).

const plot = { id: 'P01', polygon: { type: 'Polygon' as const, coordinates: [] }, areaHa: 1, geometryHash: 'g' };
function provider(name: RemoteSensingProvider['name'] = 'fixture'): RemoteSensingProvider {
  return {
    name,
    forestLoss: vi.fn(async () => ({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025, source: 'fixture' as const })),
    ndviHistory: vi.fn(async () => ({ months: [], source: 'fixture' as const })),
    ndviWindow: vi.fn(async () => ({ mean: 0.7, clearObservations: 3, source: 'fixture' as const })),
  };
}

describe('withE2eDelay', () => {
  it('is ignored without E2E=1: the same provider, even with a delay set', () => {
    const p = provider();
    expect(withE2eDelay(p, { E2E: '0', E2E_FIXTURE_DELAY_MS: 2000 })).toBe(p);
    expect(withE2eDelay(p, { E2E: '1' })).toBe(p);
    expect(withE2eDelay(p, { E2E: '1', E2E_FIXTURE_DELAY_MS: 0 })).toBe(p);
  });

  it('never delays the live provider, even with E2E=1', () => {
    const live = provider('live');
    expect(withE2eDelay(live, { E2E: '1', E2E_FIXTURE_DELAY_MS: 2000 })).toBe(live);
  });

  it('reads E2E and E2E_FIXTURE_DELAY_MS through env.ts by default', async () => {
    vi.resetModules();
    vi.stubEnv('E2E', '1');
    vi.stubEnv('E2E_FIXTURE_DELAY_MS', '2000');
    try {
      const { withE2eDelay: fresh } = await import('./context');
      const p = provider();
      expect(fresh(p)).not.toBe(p);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('with E2E=1 delays the NDVI calls only', async () => {
    vi.useFakeTimers();
    try {
      const p = provider();
      const d = withE2eDelay(p, { E2E: '1', E2E_FIXTURE_DELAY_MS: 2000 });
      await expect(d.forestLoss(plot)).resolves.toMatchObject({ lossPct: 0 });
      let answered = false;
      const w = d.ndviWindow(plot, '2026-09-28', 30).then((x) => {
        answered = true;
        return x;
      });
      await vi.advanceTimersByTimeAsync(1999);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(w).resolves.toMatchObject({ mean: 0.7 });
    } finally {
      vi.useRealTimers();
    }
  });
});

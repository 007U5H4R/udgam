import { describe, expect, it, vi } from 'vitest';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import { withE2eDelay } from './context';

// TSK-10.10: the test-only NDVI delay (E2E_FIXTURE_DELAY_MS) exists only when E2E=1 (technical-plan §1).

const plot = { id: 'P01', polygon: { type: 'Polygon' as const, coordinates: [] }, areaHa: 1 };
function provider(): RemoteSensingProvider {
  return {
    name: 'fixture',
    forestLoss: vi.fn(async () => ({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025 })),
    ndviHistory: vi.fn(async () => ({ months: [] })),
    ndviWindow: vi.fn(async () => ({ mean: 0.7, clearObservations: 3 })),
  };
}

describe('withE2eDelay', () => {
  it('is ignored without E2E=1: the same provider, even with a delay set', () => {
    const p = provider();
    expect(withE2eDelay(p, { E2E_FIXTURE_DELAY_MS: '2000' })).toBe(p);
    expect(withE2eDelay(p, { E2E: '0', E2E_FIXTURE_DELAY_MS: '2000' })).toBe(p);
    expect(withE2eDelay(p, { E2E: '1' })).toBe(p);
  });

  it('with E2E=1 delays the NDVI calls only', async () => {
    vi.useFakeTimers();
    try {
      const p = provider();
      const d = withE2eDelay(p, { E2E: '1', E2E_FIXTURE_DELAY_MS: '2000' });
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

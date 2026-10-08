import { describe, expect, it } from 'vitest';
import type { PickingMonth } from '../../lib/db/queries/pickings';
import { PICKINGS_LIMIT } from '../../lib/db/queries/pickings';
import { pickingsLimitNote } from './pickings-limit';

// DES-022: the Pickings tab lists the newest PICKINGS_LIMIT (200); at the limit it says so, and where
// the older ones are, instead of stopping silently.

const months = (sizes: number[]) => sizes.map((n, i) => ({ month: `2026-0${i + 1}`, items: Array.from({ length: n }) }) as unknown as PickingMonth);

describe('pickingsLimitNote', () => {
  it('under the limit: nothing to say', () => {
    expect(pickingsLimitNote(months([60, 3]), 'en')).toBeNull();
    expect(pickingsLimitNote([], 'en')).toBeNull();
  });

  it('at the limit: "Showing your last 200 pickings. Ask the office for earlier ones."', () => {
    expect(PICKINGS_LIMIT).toBe(200);
    expect(pickingsLimitNote(months([120, 80]), 'en')).toBe('Showing your last 200 pickings. Ask the office for earlier ones.');
    expect(pickingsLimitNote(months([120, 80]), 'kn')).toContain('200');
  });
});

import { describe, expect, it } from 'vitest';
import { chosenCrop, plotsOf, shownEvents, toggleCrop, type PickRow } from './batch-builder-state';

// DES-107 (Design.md §8, the brief's 50-event batches): the batch builder's select-all per crop and plot
// filter. A batch holds one crop, so selecting all of one crop never mixes in the other; the filter only
// hides rows, it never drops a choice already made.

const rows: PickRow[] = [
  { eventId: 'E1', crop: 'arabica', plot: 'PL-A' },
  { eventId: 'E2', crop: 'arabica', plot: 'PL-B' },
  { eventId: 'E3', crop: 'robusta', plot: 'PL-B' },
  { eventId: 'E4', crop: 'arabica', plot: 'PL-A' },
];

describe('batch builder selection (DES-107)', () => {
  it('select all of a crop adds every shown picking of that crop, and a second press clears them', () => {
    const all = toggleCrop(rows, new Set(), 'arabica');
    expect([...all].sort()).toEqual(['E1', 'E2', 'E4']);
    expect(chosenCrop(rows, all)).toBe('arabica');
    expect([...toggleCrop(rows, all, 'arabica')]).toEqual([]);
  });

  it('select all respects the plot filter and keeps choices made under another filter', () => {
    const onB = toggleCrop(shownEvents(rows, 'PL-B'), new Set(), 'arabica');
    expect([...onB]).toEqual(['E2']);
    const plusA = toggleCrop(shownEvents(rows, 'PL-A'), onB, 'arabica');
    expect([...plusA].sort()).toEqual(['E1', 'E2', 'E4']);
  });

  it('never mixes crops: select all of the other crop is a no-op while one crop is chosen', () => {
    const one = new Set(['E1']);
    expect(toggleCrop(rows, one, 'robusta')).toBe(one);
    // a robusta choice hidden by the filter still blocks arabica
    const hidden = new Set(['E3']);
    expect(toggleCrop(shownEvents(rows, 'PL-A'), hidden, 'arabica', rows)).toBe(hidden);
  });

  it('the filter lists each plot once with its count, in order, and null shows everything', () => {
    expect(plotsOf(rows)).toEqual([
      { plot: 'PL-A', n: 2 },
      { plot: 'PL-B', n: 2 },
    ]);
    expect(shownEvents(rows, null)).toBe(rows);
    expect(shownEvents(rows, 'PL-A').map((r) => r.eventId)).toEqual(['E1', 'E4']);
  });
});

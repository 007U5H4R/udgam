// The batch builder's selection rules (DES-107). Pure, so the client component stays a thin view: a batch
// holds one crop (TP14), select all of a crop adds every shown picking of it (or clears them when all are
// already chosen), and the plot filter only hides rows: choices made under another filter stay chosen.

export type Crop = 'arabica' | 'robusta';
export type PickRow = { eventId: string; crop: Crop; plot: string };

/** The crop of the pickings chosen so far, or null when none is. */
export function chosenCrop(rows: readonly PickRow[], chosen: ReadonlySet<string>): Crop | null {
  return rows.find((r) => chosen.has(r.eventId))?.crop ?? null;
}

/** The rows the plot filter shows (null: every plot). */
export function shownEvents<T extends PickRow>(rows: readonly T[], plot: string | null): readonly T[] {
  return plot === null ? rows : rows.filter((r) => r.plot === plot);
}

/** Each plot once, with how many eligible pickings it has, in the order the plots are named. */
export function plotsOf(rows: readonly PickRow[]): { plot: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.plot, (counts.get(r.plot) ?? 0) + 1);
  return [...counts].map(([plot, n]) => ({ plot, n })).sort((a, b) => a.plot.localeCompare(b.plot));
}

/**
 * Select all of `crop` among the shown rows, or clear them when every one is already chosen. While the
 * other crop is chosen (among `all` rows, shown or not) the selection is returned unchanged (the control
 * is disabled then too).
 */
export function toggleCrop(shown: readonly PickRow[], chosen: ReadonlySet<string>, crop: Crop, all: readonly PickRow[] = shown): ReadonlySet<string> {
  const current = chosenCrop(all, chosen); // a hidden choice counts: the filter never lets crops mix
  if (current !== null && current !== crop) return chosen;
  const ids = shown.filter((r) => r.crop === crop).map((r) => r.eventId);
  const next = new Set(chosen);
  if (ids.length > 0 && ids.every((id) => chosen.has(id))) for (const id of ids) next.delete(id);
  else for (const id of ids) next.add(id);
  return next;
}

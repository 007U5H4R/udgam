// The SEC-003 daily capture budget's defaults: one source for env.ts (which may import nothing heavy)
// and budget.ts. Sized from EV9's placeholder of 3 photos × 4 MB per capture: 100 captures and
// 100 × 12 MiB = 1.2 GiB per agent per India day (see budget.ts for the reasoning).

export type CaptureBudget = { maxCaptures: number; maxBytes: number };

export const DEFAULT_CAPTURE_BUDGET: CaptureBudget = { maxCaptures: 100, maxBytes: 100 * 3 * 4 * 1024 * 1024 };

// Bounded eth_getLogs scans (Stage 9 CR-206). Hosted RPCs cap the block range of one log query, so the
// registry client (anchoredLog) and the escrow client (its lost-receipt recovery) both page their scans
// through these windows instead of asking for deployment..latest in one call.

/** Blocks per eth_getLogs call by default. */
export const LOG_RANGE_BLOCKS = 5_000;

/**
 * Inclusive [from, to] windows of at most `size` blocks that cover start..head exactly once: oldest first
 * (to find the first log) or newest first (to find the latest). Nothing when start > head.
 */
export function* blockWindows(start: bigint, head: bigint, size: bigint, order: 'oldest-first' | 'newest-first' = 'oldest-first'): Generator<[bigint, bigint]> {
  const step = size < BigInt(1) ? BigInt(1) : size;
  if (order === 'oldest-first') {
    for (let from = start; from <= head; from += step) yield [from, from + step - BigInt(1) < head ? from + step - BigInt(1) : head];
  } else {
    for (let to = head; to >= start; to -= step) yield [to - step + BigInt(1) > start ? to - step + BigInt(1) : start, to];
  }
}

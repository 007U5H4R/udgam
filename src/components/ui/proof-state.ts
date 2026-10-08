import { useSyncExternalStore } from 'react';
import type { VerifyFailure } from '../../lib/ledger/proof';

// The certificate's proof state (TKT-16), shared by the proof panel (which verifies and writes it) and
// the parts of the page that change with it (the entry chips: "Checking", the recorded verdict, "Not
// confirmed", "Does not match"). A tiny external store read with useSyncExternalStore, so the server
// render and the first client render agree on `loading` and no green is ever rendered before the
// visitor's own browser has verified the proof.

export type ProofUiState =
  | { status: 'loading'; done: number; total: number }
  | { status: 'verified'; entries: number; checkpoints: { id: number; kid: string }[]; publishedKid: string | null }
  /** `record` is the failing entry's 1-based position among the feed's `total` entries, when the failure names one. */
  | { status: 'mismatch'; failure: VerifyFailure; total: number; record: number | null; publishedKid: string | null }
  | { status: 'unavailable' };

const INITIAL: ProofUiState = { status: 'loading', done: 0, total: 0 };
let state: ProofUiState = INITIAL;
const listeners = new Set<() => void>();

export function setProofState(next: ProofUiState): void {
  state = next;
  for (const l of listeners) l();
}

export function getProofState(): ProofUiState {
  return state;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The current proof state; `loading` on the server and in the first client render. */
export function useProofState(): ProofUiState {
  return useSyncExternalStore(subscribe, getProofState, () => INITIAL);
}

/** Back to the initial state (tests; a remounted panel). */
export function resetProofState(): void {
  setProofState(INITIAL);
}

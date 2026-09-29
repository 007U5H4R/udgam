import { sendOutboxItem, submitCapture, type OutboxSend, type Photo, type SendOptions, type SubmitResult } from '../../client/capture-client';
import type { GpsWatch } from '../../client/gps';
import { refusalKeepsOutbox } from '../../lib/i18n/farmer-evidence';
import type { FlowAction } from './record-flow';

// The record flow's Send (TSK-10.9/10.11), kept out of the React component so it is unit-tested.
// The first Send signs and saves the picking; the saved copy is held as soon as it is stored, so every
// "Try again" re-sends those identical bytes (TP7), never a new signature for the same seq.

export type HeldCopy = { current: OutboxSend | null };
export type Draft = { plotId: string; cherryKg: number; photos: Photo[]; gps: GpsWatch | null };

const errName = (err: unknown) => (err instanceof Error ? err.name : typeof err);

/** Send the picking: the held copy when there is one, else sign and save a new one. Never throws. */
export async function sendPicking(held: HeldCopy, draft: Draft, opts: Pick<SendOptions, 'onCheck' | 'fetchImpl'> = {}): Promise<SubmitResult> {
  let r: SubmitResult;
  try {
    r = held.current
      ? await sendOutboxItem(held.current, { ...opts, keepOnRefusal: refusalKeepsOutbox })
      : await submitCapture(draft, {
          ...opts,
          keepOnRefusal: refusalKeepsOutbox,
          onSaved: (item) => {
            held.current = item;
          },
        });
  } catch (err) {
    // Signing or the phone's store failed before anything was sent (sendOutboxItem never throws).
    console.error('capture.send_failed', { errClass: errName(err) });
    r = { kind: 'retryable', cause: 'server' };
  }
  if (r.kind === 'verdict' || (r.kind === 'rejected' && !refusalKeepsOutbox(r.reason))) held.current = null;
  return r;
}

/** The screen's answer to a send: the verdict, Not accepted, or saved on the phone. */
export function settleAction(r: SubmitResult): FlowAction {
  switch (r.kind) {
    case 'verdict':
      return { type: 'verdict', v: r.verdict };
    case 'rejected':
      return refusalKeepsOutbox(r.reason) ? { type: 'fail', kind: 'server', reason: r.reason } : { type: 'fail', kind: 'rejected', reason: r.reason };
    case 'retryable':
      return {
        type: 'fail',
        kind: r.cause,
        ...(r.reason !== undefined ? { reason: r.reason } : {}),
        ...(r.retryAfterSec !== undefined ? { retryAfterSec: r.retryAfterSec } : {}),
      };
    case 'not_ready':
      return r.reason === 'no_device' ? { type: 'fail', kind: 'rejected', reason: 'unknown_device' } : { type: 'fail', kind: 'server', reason: 'no_fix' };
  }
}

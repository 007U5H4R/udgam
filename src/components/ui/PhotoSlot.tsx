import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

// A photo slot tile (Design.md §13 "photo slot tiles + counter"), ported from final/index.html s2:
// the thumbnail (the farmer's own photo once added, otherwise the slot's example drawing), the slot's
// name and its state word with an icon — Added · Next · Example.

export type SlotState = 'filled' | 'next' | 'todo';

export function PhotoSlot({
  state,
  name,
  stateLabel,
  stateIcon,
  preview,
  example,
}: {
  state: SlotState;
  name: string;
  stateLabel: string;
  stateIcon?: ReactNode;
  /** An object URL of the accepted photo. */
  preview?: string;
  example: ReactNode;
}) {
  return (
    <GlassCard as="li" card={false} className="slot" data-state={state}>
      <div className="thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the phone's own photo */}
        {state === 'filled' && preview ? <img src={preview} alt="" /> : example}
      </div>
      <span className="s-name">{name}</span>
      <span className="s-state">
        {stateIcon}
        <span>{stateLabel}</span>
      </span>
    </GlassCard>
  );
}

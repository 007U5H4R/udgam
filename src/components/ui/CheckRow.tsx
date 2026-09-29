import { Ic } from '../field/icons';
import { GlassCard } from './GlassCard';

// A check row (Design.md §13 "check rows + progress bar"), ported from final/index.html s4: the group's
// name and its state — Done (tick), Checking (the turning ring; still under reduced motion), Waiting.

export type RowState = 'done' | 'now' | 'wait';

export function CheckRow({ name, state, stateLabel, group }: { name: string; state: RowState; stateLabel: string; group: string }) {
  return (
    <GlassCard as="li" card={false} className={state} data-group={group} data-state={state}>
      <span className="c-name">{name}</span>
      <span className="c-state">
        <Ic name={state === 'done' ? 'check' : state === 'now' ? 'ring' : 'clock'} />
        {stateLabel}
      </span>
    </GlassCard>
  );
}

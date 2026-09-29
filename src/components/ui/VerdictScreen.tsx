'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Ic } from '../field/icons';
import { Cherry } from './Cherry';
import { Pill } from './Pill';

// The one verdict template for all three outcomes (Design.md §10, D5), ported from final/index.html
// #s5 (Verified) and #s6 (Needs a check); Not accepted uses the same template with --bad tokens, no
// cherry rim and no green anywhere (TP17). The cherry rises and its rim blooms only on Verified and
// only without reduced motion (the one motion moment, Design.md §15). When the heading is on screen,
// focus moves to it.

/** EVAL-070 t1 (EV9): the verdict card is visible. Marked once this screen's heading has mounted. */
export const T1_MARK = 'udgam:t1-verdict';

/**
 * The verdict has arrived and rendered on the checking screen, before the 600 ms auto-advance hold (or
 * "See result" under reduced motion). Reported as its own split next to t1; EV9's t1 is unchanged.
 */
export const VERDICT_IN_MARK = 'udgam:verdict-in';

export type VerdictTone = 'ok' | 'check' | 'bad';

export function VerdictScreen({
  tone,
  motion,
  status,
  heading,
  sub,
  children,
  doneLabel,
  onDone,
}: {
  tone: VerdictTone;
  /** The cherry rises (Verified, motion allowed). */
  motion: boolean;
  /** Needs a check: the verdict chip above the heading. */
  status?: ReactNode;
  heading: ReactNode;
  sub?: ReactNode;
  /** The evidence card. */
  children: ReactNode;
  doneLabel: string;
  onDone: () => void;
}) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
    const id = requestAnimationFrame(() => performance.mark(T1_MARK));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <main className="screen" aria-labelledby="verdict-h" data-verdict-tone={tone}>
      <div className="spacer" aria-hidden="true" />
      <Cherry
        size={176}
        className="verdict-top"
        tone={tone === 'ok' ? 'green' : tone === 'check' ? 'amber' : 'none'}
        motion={tone === 'ok' && motion ? 'rise' : 'none'}
        badge={tone}
      />
      {status ? <p className="status-row">{status}</p> : null}
      <h1 ref={h1} className={tone === 'check' ? 'h1 center' : 'v-word center'} id="verdict-h" tabIndex={-1}>
        {heading}
      </h1>
      {sub ? <p className="v-sub">{sub}</p> : null}
      {children}
      <div className="actions">
        <Pill icon={<Ic name="check" />} onClick={onDone}>
          {doneLabel}
        </Pill>
      </div>
    </main>
  );
}

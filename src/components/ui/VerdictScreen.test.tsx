// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { T1_MARK, VerdictScreen } from './VerdictScreen';

// TKT-10 nit (TASK-11 spec r3 N5): EV9's t1 frame is queued in the commit that first shows the card
// (a layout effect), never from a passive effect that may run after that frame has painted.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe('VerdictScreen t1 (EV9)', () => {
  it("queues the t1 frame in the commit's layout phase, before passive effects, and marks t1 in that frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const mark = vi.spyOn(performance, 'mark');
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    // A later sibling's layout effect runs after VerdictScreen's layout effects and before any passive
    // effect of the commit: the t1 frame must already be queued by then.
    let queuedInCommit = -1;
    function After() {
      useLayoutEffect(() => {
        queuedInCommit = frames.length;
      }, []);
      return null;
    }
    act(() =>
      root.render(
        <>
          <VerdictScreen tone="ok" motion={false} heading="Verified" doneLabel="Done" onDone={() => undefined}>
            <p>card</p>
          </VerdictScreen>
          <After />
        </>,
      ),
    );
    expect(queuedInCommit).toBe(1);
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    expect(mark).toHaveBeenCalledWith(T1_MARK);
    act(() => root.unmount());
  });
});

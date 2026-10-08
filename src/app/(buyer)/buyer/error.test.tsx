// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// CR-100 follow-up (EVAL-088): the buyer error boundary's Try again fetches the route's server part afresh
// (router.refresh) and then re-renders it (reset), like every other surface's boundary (useRetry). With
// reset alone, a server failure would be rendered again from the same failed payload.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { default: BuyerError } = await import('./error');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('Try again refreshes the server data, then resets the boundary', async () => {
  const reset = vi.fn();
  act(() => root.render(<BuyerError error={new Error('boom')} reset={reset} />));
  const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
  await act(async () => retry.click());
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('boom');
});

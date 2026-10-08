// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// CR-100 follow-up (EVAL-088): the processor error boundary's Try again fetches the route's server part
// afresh (router.refresh) and re-renders it (reset) where the processor was, like every other surface's
// boundary (useRetry), instead of a full load of /processor that left a batch detail.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
// The rail carries the sign-out Server Action; the boundary's own behaviour is what is tested here.
vi.mock('../../../components/ui/Rail', () => ({ RailShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const { default: ProcessorError } = await import('./error');
const { COPY } = await import('../../../lib/processing/copy');

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

it('Try again refreshes the server data, then resets the boundary, without leaving the page', async () => {
  const reset = vi.fn();
  act(() => root.render(<ProcessorError error={new Error('boom')} reset={reset} />));
  const retry = [...host.querySelectorAll('a, button')].find((b) => b.textContent === COPY.retry) as HTMLElement;
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => void retry.dispatchEvent(click));
  expect(click.defaultPrevented).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('boom');
});

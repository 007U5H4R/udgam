// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hydratedAttr, useHydrated } from './useHydrated';

// QA-P5-7: the photo inputs carry data-hydrated="true" only once React has attached their handlers, so
// the capture e2e can wait for it before choosing a file (a file chosen before hydration is lost).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const hydrated = useHydrated();
  return <input type="file" name="photo" {...hydratedAttr(hydrated)} />;
}

describe('useHydrated (QA-P5-7)', () => {
  it('the server markup has no hydration marker', () => {
    expect(renderToString(<Probe />)).toBe('<input type="file" name="photo"/>');
  });

  it('after the client mounts, the input carries data-hydrated="true"', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<Probe />));
    expect(el.querySelector('input')!.getAttribute('data-hydrated')).toBe('true');
    act(() => root.unmount());
  });
});

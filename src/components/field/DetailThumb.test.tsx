// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DetailThumb } from './DetailThumb';

// DES-017 / DES-020: a picking's thumbnail has alt="" (its caption names it) and, when it does not
// load, a neutral "Photo not available" tile instead of the broken-image glyph.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host).render(<DetailThumb src="/api/media/M-1/thumb" missing="Photo not available" />));
  return host;
}

describe('DetailThumb', () => {
  it('renders the thumbnail with an empty alt', () => {
    const img = mount().querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/api/media/M-1/thumb');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('a thumbnail that fails to load becomes the "Photo not available" tile', () => {
    const host = mount();
    act(() => void host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-testid="thumb-missing"]')!.textContent).toBe('Photo not available');
    expect(host.querySelector('svg.ic')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOffline, OFFLINE_EVENT, showOffline, whenOnline } from './offline';
import { OfflineSheet } from './OfflineSheet';

// DES-002 (EXE40): with no network, a tab, a link or "Send now" never hands the page to the browser's
// own offline page: the app stays and shows the saved-on-phone sheet ("No network here … Nothing is lost").

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('whenOnline', () => {
  it('runs the navigation when the phone is online', () => {
    setOnline(true);
    const go = vi.fn();
    const shown = vi.fn();
    window.addEventListener(OFFLINE_EVENT, shown);
    expect(whenOnline(go)).toBe(true);
    expect(go).toHaveBeenCalledOnce();
    expect(shown).not.toHaveBeenCalled();
    window.removeEventListener(OFFLINE_EVENT, shown);
  });

  it('offline: never navigates, asks for the offline sheet instead', () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
    const go = vi.fn();
    const shown = vi.fn();
    window.addEventListener(OFFLINE_EVENT, shown);
    expect(whenOnline(go)).toBe(false);
    expect(go).not.toHaveBeenCalled();
    expect(shown).toHaveBeenCalledOnce();
    window.removeEventListener(OFFLINE_EVENT, shown);
  });
});

describe('OfflineSheet', () => {
  function mount() {
    // jsdom has no <dialog> modal API
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    const host = document.createElement('div');
    document.body.append(host);
    const link = document.createElement('a');
    link.href = '/field/pickings';
    link.textContent = 'Pickings';
    document.body.append(link);
    const tel = document.createElement('a');
    tel.href = 'tel:+918272000111';
    document.body.append(tel);
    act(() => createRoot(host).render(<OfflineSheet lang="en" />));
    const sheet = () => document.querySelector<HTMLDialogElement>('[data-testid="offline-sheet"]')!;
    return { link, tel, sheet };
  }

  it('offline: a tap on an app link is stopped and the sheet says nothing is lost', () => {
    const { link, sheet } = mount();
    setOnline(false);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const reached = vi.fn();
    document.body.addEventListener('click', reached);
    act(() => void link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    expect(sheet().open).toBe(true);
    expect(sheet().textContent).toContain('No network here');
    expect(sheet().textContent).toContain('Nothing is lost');
  });

  it('online, or a tel: link: the tap goes through untouched', () => {
    const { link, tel, sheet } = mount();
    setOnline(true);
    const a = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => void link.dispatchEvent(a));
    expect(a.defaultPrevented).toBe(false);
    setOnline(false);
    const b = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => void tel.dispatchEvent(b));
    expect(b.defaultPrevented).toBe(false);
    expect(sheet().open).toBe(false);
  });

  it('showOffline() opens it from anywhere (Send now, the Record pill)', () => {
    const { sheet } = mount();
    act(() => showOffline());
    expect(sheet().open).toBe(true);
  });
});

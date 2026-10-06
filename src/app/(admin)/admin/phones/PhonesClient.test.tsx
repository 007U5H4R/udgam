// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CR-100 (EVAL-088): the four /admin/phones actions run through useActionState, so an action that
// rejects (the network dropped, the server fell over) would be rethrown to the nearest error boundary.
// Each one instead shows the page's own "That did not work … Nothing was changed." line and stays usable.

const ACTION_FAILED = 'That did not work. Reload the page and try again. Nothing was changed.';

const issue = vi.fn();
const revoke = vi.fn();
const assign = vi.fn();
const unassign = vi.fn();
vi.mock('./actions', () => ({
  issueCodeAction: (...a: unknown[]) => issue(...a),
  revokeAction: (...a: unknown[]) => revoke(...a),
  assignAction: (...a: unknown[]) => assign(...a),
  unassignAction: (...a: unknown[]) => unassign(...a),
}));
// The Sheet portals and animates; a plain stand-in keeps the confirm form in the tree.
vi.mock('../../../../components/ui/Sheet', () => ({
  Sheet: ({ children, testId }: { children: React.ReactNode; testId?: string }) => <div data-testid={testId}>{children}</div>,
}));

const { PhonesClient } = await import('./PhonesClient');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const errors: unknown[] = [];
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host, { onUncaughtError: (e) => void errors.push(e), onCaughtError: (e) => void errors.push(e) });
  for (const f of [issue, revoke, assign, unassign]) f.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
  errors.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const AGENT = {
  id: 'U-AG1',
  name: 'Ravi',
  email: 'ravi@example.test',
  phones: [{ id: 'DEV-1', enrolled: '1 Oct', revoked: null, lastCapture: null }],
  plots: [{ id: 'P-1', label: 'P-1 · Asha' }],
  options: [{ id: 'P-2', label: 'P-2 · Bopanna' }],
};

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map((e) => e.textContent).filter(Boolean);
async function press(el: Element | null) {
  await act(async () => (el as HTMLButtonElement).click());
  await flush();
}
async function chooseOption() {
  const select = host.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'P-2');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('/admin/phones actions survive a rejected Server Action (CR-100)', () => {
  it('Issue code', async () => {
    act(() => root.render(<PhonesClient agents={[AGENT]} />));
    await press(host.querySelector('form button[type="submit"]'));
    expect(issue).toHaveBeenCalledTimes(1);
    expect(alerts()).toEqual([ACTION_FAILED]);
    expect(errors).toEqual([]);
  });

  it('Revoke', async () => {
    act(() => root.render(<PhonesClient agents={[AGENT]} />));
    await press(host.querySelector('button[aria-haspopup="dialog"]'));
    await press(host.querySelector('[data-testid="revoke-sheet"] button[type="submit"]'));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(alerts()).toEqual([ACTION_FAILED]);
    expect(errors).toEqual([]);
  });

  it('Remove a plot', async () => {
    act(() => root.render(<PhonesClient agents={[AGENT]} />));
    await press(host.querySelector('[data-testid="assigned-U-AG1-P-1"] button[type="submit"]'));
    expect(unassign).toHaveBeenCalledTimes(1);
    expect(alerts()).toEqual([ACTION_FAILED]);
    expect(errors).toEqual([]);
  });

  it('Add a plot', async () => {
    act(() => root.render(<PhonesClient agents={[AGENT]} />));
    await chooseOption();
    const add = [...host.querySelectorAll('button[type="submit"]')].find((b) => b.textContent === 'Assign');
    await press(add ?? null);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(alerts()).toEqual([ACTION_FAILED]);
    expect(errors).toEqual([]);
  });
});

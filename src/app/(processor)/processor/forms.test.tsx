// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TKT-26 quality review minor 3 (follow-up 2): a refusal that retrying can never fix (the batch changed
// under this page, e.g. in another tab) shows its own words and a Reload, never the generic "Couldn’t …"
// error with "Try again". A failure that retrying can fix keeps "Try again". Copy is literal from the
// follow-up brief and en.ts.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const handOnAction = vi.fn();
const recordStepAction = vi.fn();
vi.mock('./actions', () => ({ handOnAction: (...a: unknown[]) => handOnAction(...a), recordStepAction: (...a: unknown[]) => recordStepAction(...a) }));

const { HandOnForm } = await import('./HandOnForm');
const { StepForm } = await import('./StepForm');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  refresh.mockReset();
  handOnAction.mockReset();
  recordStepAction.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const button = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function submit() {
  await act(async () => button().click());
  await flush();
}

async function handOnWith(reason: string) {
  handOnAction.mockResolvedValue({ ok: false, reason });
  act(() => root.render(<HandOnForm batchId="B-1" buyers={[{ id: 'ORG-BUY', name: 'Demo Buyer A' }]} />));
  const select = host.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    set.call(select, 'ORG-BUY');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await submit();
}

async function stepWith(reason: string) {
  recordStepAction.mockResolvedValue({ ok: false, reason });
  act(() => root.render(<StepForm batchId="B-1" crop="arabica" />));
  const radio = host.querySelector('#p-proc-2') as HTMLInputElement;
  const typeInto = (el: HTMLInputElement, v: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => radio.click());
  await act(async () => typeInto(host.querySelector('#p-in') as HTMLInputElement, '600'));
  await act(async () => typeInto(host.querySelector('#p-out') as HTMLInputElement, '480'));
  await submit();
}

describe('processor forms: refusals that retrying cannot fix', () => {
  it('hand-on refused not_held: "This batch was already handed on. …Reload to see where it is." and Reload, no Try again', async () => {
    await handOnWith('not_held');
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe('This batch was already handed on.Nothing was signed. Reload to see where it is.');
    expect(host.textContent).not.toContain('Try again');
    expect(host.textContent).not.toContain('The batch is still with you.');
    expect(button().textContent).toBe('Reload');
    await act(async () => button().click());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(handOnAction).toHaveBeenCalledTimes(1); // Reload does not send again
  });

  it('hand-on refused no_step: its own words and Reload', async () => {
    await handOnWith('no_step');
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('No processing step is recorded for this batch yet.Nothing was signed. Reload to record the step before handing the batch on.');
    expect(host.textContent).not.toContain('Try again');
    expect(button().textContent).toBe('Reload');
  });

  it('step refused already_recorded: its own words and Reload', async () => {
    await stepWith('already_recorded');
    expect(recordStepAction).toHaveBeenCalledWith({ batchId: 'B-1', process: 'hulling_parchment', inputKg: '600', outputKg: '480' });
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('A step was already recorded for this batch.Nothing new was signed. Reload to see the recorded step.');
    expect(host.textContent).not.toContain('Try again');
    expect(button().textContent).toBe('Reload');
    await act(async () => button().click());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(recordStepAction).toHaveBeenCalledTimes(1);
  });

  it('step refused not_held (handed on in another tab): its own words and Reload', async () => {
    await stepWith('not_held');
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('This batch was already handed on.Nothing was signed. Reload to see where it is.');
    expect(button().textContent).toBe('Reload');
  });

  it('an unexpected failure keeps the generic error and Try again', async () => {
    await handOnWith('failed');
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('Couldn’t hand on the batch.Nothing was signed. The batch is still with you.');
    expect(button().textContent).toBe('Try again');
  });
});

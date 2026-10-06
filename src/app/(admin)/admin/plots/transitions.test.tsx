// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CR-100 (EVAL-088): a Server Action that rejects (the network dropped, the server fell over) never
// reaches an error page or an unhandled rejection from the plot screens: "Check again", "Save plot" and
// "Save boundary" each say that nothing was changed and stay usable, like DecideForm and StepForm.

const FAILED = 'That did not work. Nothing was changed. Check the connection and try again.';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

const rerun = vi.fn();
const create = vi.fn();
const upload = vi.fn();
const update = vi.fn();
vi.mock('./actions', () => ({
  rerunRegistrationChecksAction: (...a: unknown[]) => rerun(...a),
  createPlotAction: (...a: unknown[]) => create(...a),
  uploadPlotFileAction: (...a: unknown[]) => upload(...a),
  updatePlotGeometryAction: (...a: unknown[]) => update(...a),
}));

// The Leaflet editor is replaced by a stand-in: it reports a drawn square at once and, when given a
// save, runs it from a button and shows what it returned.
const SQUARE = { type: 'Polygon', coordinates: [[[75.7, 12.4], [75.701, 12.4], [75.701, 12.401], [75.7, 12.401], [75.7, 12.4]]] };
vi.mock('../../../../components/admin/PlotEditor', async () => {
  const { useEffect, useState } = await import('react');
  return {
    PlotEditor: ({ onChange, save }: { onChange?: (c: unknown) => void; save?: { label: string; run: (g: unknown) => Promise<string | null> } }) => {
      const [msg, setMsg] = useState('');
      useEffect(() => onChange?.({ geometry: SQUARE, error: null }), [onChange]);
      return save ? (
        <div>
          <button type="button" data-testid="save" onClick={() => void save.run(SQUARE).then((m) => setMsg(m ?? 'saved'), () => setMsg('REJECTED'))}>
            {save.label}
          </button>
          <p data-testid="save-msg">{msg}</p>
        </div>
      ) : null;
    },
  };
});

const { RerunChecks } = await import('./RerunChecks');
const { NewPlotForm } = await import('./NewPlotForm');
const { EditBoundary } = await import('./EditBoundary');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const rejections: unknown[] = [];
const onRejection = (r: unknown) => void rejections.push(r);
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  for (const f of [refresh, push, rerun, create, upload, update]) f.mockReset();
  rejections.length = 0;
  process.on('unhandledRejection', onRejection);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  process.off('unhandledRejection', onRejection);
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const alertText = () => [...host.querySelectorAll('[role="alert"]')].map((e) => e.textContent).join(' ');

describe('plot transitions survive a rejected Server Action (CR-100)', () => {
  it('Check again: says nothing was changed and is usable again', async () => {
    rerun.mockRejectedValue(new TypeError('Failed to fetch'));
    act(() => root.render(<RerunChecks plotId="P-1" />));
    const btn = host.querySelector('button') as HTMLButtonElement;
    await act(async () => btn.click());
    await flush();
    expect(alertText()).toContain(FAILED);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Check again');
    expect(refresh).not.toHaveBeenCalled();
    expect(rejections).toEqual([]);
  });

  it('Save plot: says nothing was changed, stays on the form and is usable again', async () => {
    create.mockRejectedValue(new TypeError('Failed to fetch'));
    act(() => root.render(<NewPlotForm farmers={[{ id: 'F-1', name: 'Asha', producerId: 'PR-1' }]} tiles={null} />));
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'F-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => submit.click());
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.querySelector('#plot-error')!.textContent).toBe(FAILED);
    expect(submit.disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(rejections).toEqual([]);
  });

  it('Save boundary: the editor is told nothing was changed (no rejection reaches it)', async () => {
    update.mockRejectedValue(new TypeError('Failed to fetch'));
    act(() => root.render(<EditBoundary plotId="P-1" geometry={SQUARE as never} tiles={null} />));
    await act(async () => (host.querySelector('[data-testid="save"]') as HTMLButtonElement).click());
    await flush();
    expect(host.querySelector('[data-testid="save-msg"]')!.textContent).toBe(FAILED);
    expect(refresh).not.toHaveBeenCalled();
  });
});

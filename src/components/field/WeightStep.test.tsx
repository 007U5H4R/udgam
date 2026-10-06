// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { WeightStep } from './WeightStep';

// DES-028: the "Yes, send" label only shows with its reason. A refused key on a weight far from the farmer's
// last pickings shows the half-kilo rule AND the check line; a refused key alone keeps the normal Send label.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

const RANGE = { min: 38.5, max: 51 };

function mount(kg: string, refused: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const noop = () => undefined;
  act(() =>
    createRoot(host).render(
      <WeightStep kg={kg} refused={refused} photos={1} plotName="Plot 1" range={RANGE} lang="en" gps="ok" onKey={noop} onBack={noop} onSend={noop} />,
    ),
  );
  const hint = host.querySelector('.kg-hint');
  return {
    lines: hint ? [...hint.querySelectorAll('.kg-line')].map((l) => l.textContent) : [],
    warn: hint?.classList.contains('warn') ?? false,
    pill: host.querySelector('#send-btn')!.textContent,
  };
}

describe('WeightStep (DES-028)', () => {
  it('"4." after a refused "3" on a 38–51 kg farmer: the rule, the check line, and "Yes, send 4 kg"', () => {
    expect(mount('4.', true)).toEqual({
      lines: ['Kilos in halves (.0 or .5), up to 500 kg.', '4 kg is far from your last pickings (38–51 kg). Check the number before you send.'],
      warn: true,
      pill: 'Yes, send 4 kg',
    });
  });

  it('"49." after a refused "3": the rule alone and the normal "Send 49 kg"', () => {
    expect(mount('49.', true)).toEqual({ lines: ['Kilos in halves (.0 or .5), up to 500 kg.'], warn: true, pill: 'Send 49 kg' });
  });

  it('a likely weight: the own range and "Send 42.5 kg"', () => {
    expect(mount('42.5', false)).toEqual({ lines: ['Your last pickings: 38–51 kg'], warn: false, pill: 'Send 42.5 kg' });
  });
});

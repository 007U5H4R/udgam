import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OutboxItem } from '../../client/capture-store';
import { PendingRow, stopNote } from './PendingRow';

// TASK-12 fix round 1 (quality minor 8): the note under the saved rows says how long the phone waits
// when the server answered with Retry-After (a busy 503, a 429), so Send now never waits in silence; and
// a saved copy the app cannot read (not a payload it signed) is flagged plainly, with no Send now that
// would never do anything.

const item = (payload: string): OutboxItem => ({ id: 'OB-1', payload, signature: 'sig', files: [], plotId: 'PL-1', cherryKg: 42.5, photoCount: 1, createdAt: '2026-10-01T00:00:00.000Z', attempts: 1, order: 1 });
const SIGNED = JSON.stringify({ cherryKg: 42.5, deviceId: 'DV-1', plotId: 'PL-1', seq: 3, v: 1 });

describe('stopNote', () => {
  it('a busy 503 with Retry-After 45 → what happened, nothing lost, and the 45 s wait', () => {
    expect(stopNote([{ id: 'OB-1', result: { kind: 'retryable', cause: 'server', retryAfterSec: 45 } }], 'en')).toBe(
      "Couldn't send. Nothing is lost: your pickings are still saved on this phone. You can try again in 45 seconds.",
    );
  });

  it('a 429 (rate_limited, capped to 60 s) → the rate-limit copy with "1 minute"', () => {
    expect(stopNote([{ id: 'OB-1', result: { kind: 'retryable', cause: 'server', reason: 'rate_limited', retryAfterSec: 60 } }], 'en')).toBe(
      'Many pickings were sent from this phone in a short time. Wait 1 minute, then try again. Nothing is lost: your pickings are still saved on this phone.',
    );
  });

  it('no network, no Retry-After → what happened and nothing lost only', () => {
    expect(stopNote([{ id: 'OB-1', result: { kind: 'retryable', cause: 'offline' } }], 'en')).toBe('No network here. Nothing is lost: your pickings are still saved on this phone.');
  });

  it('a verdict → no note', () => {
    expect(stopNote([], 'en')).toBeNull();
  });
});

describe('PendingRow', () => {
  it('a signed copy: "Saved on this phone", the kg, and Send now', () => {
    const html = renderToStaticMarkup(<PendingRow item={item(SIGNED)} lang="en" busy={false} onSend={() => undefined} />);
    expect(html).toContain('Saved on this phone');
    expect(html).toContain('42.5 kg');
    expect(html).toContain('>Send now</button>');
  });

  it('a copy the app cannot read: flagged, with no Send now button', () => {
    const html = renderToStaticMarkup(<PendingRow item={item('not a signed payload')} lang="en" busy={false} onSend={() => undefined} />).replaceAll('&#x27;', "'");
    expect(html).toContain("This saved picking can't be sent. Show this phone to the office.");
    expect(html).not.toContain('<button');
    expect(html).toContain('data-unreadable="true"');
  });

  it('the flag is in Kannada too', () => {
    const html = renderToStaticMarkup(<PendingRow item={item('{')} lang="kn" busy={false} onSend={() => undefined} />);
    expect(html).toContain('ಉಳಿಸಿದ ಈ ಕೊಯ್ಲನ್ನು ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ.');
    expect(html).not.toContain('<button');
  });
});

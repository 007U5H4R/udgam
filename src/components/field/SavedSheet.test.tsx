import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sendCapture } from '../../client/capture-client';
import { SavedSheet } from './SavedSheet';
import { settleAction } from './send-picking';

// TASK-12 fix round 1 (spec minor 3): a 429 whose Retry-After is 120 s is shown as the wait the phone
// will actually keep, at most 60 s (MAX_RETRY_WAIT_SEC): the saved sheet says "1 minute", never "2
// minutes". The chain is the real one: the send's result → the flow's action → the rendered sheet.

const capture = { payload: '{"v":1}', signature: 'sig', files: [new Blob(['a'])] };

async function sheetFor(res: Response): Promise<string> {
  const action = settleAction(await sendCapture(capture, { fetchImpl: async () => res }));
  if (action.type !== 'fail') throw new Error(`expected a fail action, got ${action.type}`);
  return renderToStaticMarkup(
    <SavedSheet cause={action.kind === 'offline' ? 'offline' : 'server'} reason={action.reason} retryAfterSec={action.retryAfterSec} lang="en" photos={3} kg={42.5} plotName="Plot 1" onRetry={() => undefined} onLater={() => undefined} />,
  );
}

describe('the saved sheet after a 429 (Retry-After capped at 60 s)', () => {
  it('Retry-After 120 on a bare 429 → "Wait 1 minute, then try again."', async () => {
    const html = await sheetFor(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
    expect(html).toContain('Many pickings were sent from this phone in a short time.');
    expect(html).toContain('Wait 1 minute, then try again.');
    expect(html).not.toContain('2 minutes');
  });

  it('Retry-After 120 on the app\'s rate_limited line → "Wait 1 minute, then try again."', async () => {
    const body = `${JSON.stringify({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: 120 })}\n`;
    const html = await sheetFor(new Response(body, { status: 429, headers: { 'Retry-After': '120' } }));
    expect(html).toContain('Wait 1 minute, then try again.');
    expect(html).not.toContain('2 minutes');
  });

  it('a busy 503 with Retry-After 120 says "You can try again in 1 minute."', async () => {
    const html = await sheetFor(new Response(null, { status: 503, headers: { 'Retry-After': '120' } }));
    expect(html).toContain('You can try again in 1 minute.');
    expect(html).not.toContain('2 minutes');
  });
});

describe('DES-006: Try again shows that it ran', () => {
  const sheet = (o: { busy?: boolean; again?: boolean; cause?: 'offline' | 'server' }) =>
    renderToStaticMarkup(<SavedSheet cause={o.cause ?? 'offline'} busy={o.busy} again={o.again} lang="en" photos={3} kg={42.5} plotName="Plot 1" onRetry={() => undefined} onLater={() => undefined} />);

  it('while Try again runs the pill is disabled, busy and reads "Trying…"', () => {
    const html = sheet({ busy: true, again: false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>.*Trying…<\/button>/);
    expect(html).not.toContain('Still no network');
  });

  it('a failed Try again says "Still no network. Nothing is lost." and offers Try again again', () => {
    const html = sheet({ again: true });
    expect(html).toContain('Still no network. Nothing is lost.');
    expect(html).toMatch(/<button[^>]*>.*Try again<\/button>/);
    expect(html).not.toMatch(/disabled=""/);
    expect(sheet({ again: true, cause: 'server' })).toContain('Still couldn&#x27;t send. Nothing is lost.');
  });

  it('the first failure has no "Still" line', () => {
    expect(sheet({})).not.toContain('Still');
  });
});

describe('DES-013: a phone that is not set up', () => {
  it('says so in the sheet\'s words, offers Set up this phone, and never says Not accepted or that the picking is saved', () => {
    const html = renderToStaticMarkup(
      <SavedSheet cause="server" reason="no_device" lang="en" photos={1} kg={42.5} plotName="Plot 1" onRetry={() => undefined} onSetUp={() => undefined} onLater={() => undefined} />,
    );
    expect(html).toContain('This phone is not set up for pickings yet.');
    expect(html).toContain('Ask the office for a code to set up this phone.');
    expect(html).toMatch(/<button[^>]*>.*Set up this phone<\/button>/);
    expect(html).not.toContain('Try again');
    expect(html).not.toContain('Not accepted');
    expect(html).not.toContain('saved on this phone');
  });
});

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

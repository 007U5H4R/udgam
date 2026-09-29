import type { CaptureEvent } from '../lib/capture/pipeline';

// Sends a signed capture and reads the NDJSON progress stream line by line (technical-plan §9).
// Every outcome ends in exactly one terminal event: verdict, rejected, or a retryable error.

export function captureForm({ payloadString, signature, files }: { payloadString: string; signature: string; files: Blob[] }): FormData {
  const fd = new FormData();
  fd.set('payload', payloadString);
  fd.set('signature', signature);
  files.forEach((f, i) => fd.set(`photo${i}`, f));
  return fd;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function sendCapture(
  form: FormData,
  onEvent: (e: CaptureEvent) => void,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<{ status: number }> {
  let status = 0;
  let terminal = false;
  const deliver = (raw: string) => {
    if (raw.trim() === '') return;
    let e: CaptureEvent;
    try {
      e = JSON.parse(raw) as CaptureEvent;
    } catch {
      return; // not an NDJSON line (for example a proxy's HTML error page)
    }
    if (e.t !== 'check') terminal = true;
    onEvent(e);
  };
  try {
    const res = await fetchImpl('/api/capture', { method: 'POST', body: form });
    status = res.status;
    if (res.body) {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          deliver(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      deliver(buffer);
    }
  } catch {
    // network failure or a broken stream: the signed capture is still on the phone, so retry is safe
  }
  if (!terminal) onEvent({ t: 'error', retryable: true });
  return { status };
}

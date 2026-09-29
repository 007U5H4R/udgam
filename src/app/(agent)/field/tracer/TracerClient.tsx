'use client';

// TEMPORARY (TKT-02 tracer bullet; removed by TKT-10, which ports the frozen capture design).
// One seeded phone signs one picking and shows the streamed checks, the verdict and the evidence.
// Plain markup on purpose. The device key and state are injected into IndexedDB by the e2e until
// enrolment exists (TKT-05); the plot comes from ?plot=.

import { openDB, type IDBPDatabase } from 'idb';
import { useState, type FormEvent } from 'react';
import { captureForm, sendCapture } from '../../../../client/capture-client';
import { buildAndSign } from '../../../../client/sign';
import type { CaptureEvent } from '../../../../lib/capture/pipeline';
import { sha256Hex } from '../../../../lib/crypto';

type KeyRecord = { id: 'device'; privateKey: CryptoKey };
type DeviceRecord = { id: 'current'; deviceId: string; nextSeq: number; lastEventHash: string };
type Verdict = Extract<CaptureEvent, { t: 'verdict' }>;

/** Farmer-facing words for the three system verdicts (D5). */
const WORDS: Record<Verdict['verdict'], string> = { Verified: 'Verified', 'Needs Review': 'Needs a check', Rejected: 'Not accepted' };

function openUdgam(): Promise<IDBPDatabase> {
  return openDB('udgam', 1, {
    upgrade(db) {
      for (const store of ['keys', 'device', 'outbox']) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    },
  });
}

function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number }> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (e) => reject(new Error(e.message)),
      { enableHighAccuracy: true, timeout: 10_000 },
    ),
  );
}

export function TracerClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [kg, setKg] = useState('');
  const [checks, setChecks] = useState<{ id: string; status: string }[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setChecks([]);
    setVerdict(null);
    setMessage(null);
    try {
      const plotId = new URLSearchParams(window.location.search).get('plot');
      const db = await openUdgam();
      const key = (await db.get('keys', 'device')) as KeyRecord | undefined;
      const device = (await db.get('device', 'current')) as DeviceRecord | undefined;
      if (!plotId || !key || !device) {
        setMessage('This phone is not set up for the tracer.');
        return;
      }
      const gps = await currentPosition();
      const draft = { plotId, deviceId: device.deviceId, seq: device.nextSeq, prevEventHash: device.lastEventHash, gps, cherryKg: Number(kg), files };
      const { payloadString, signature } = await buildAndSign(draft, key.privateKey);
      const payloadHash = await sha256Hex(payloadString);
      setSigned(payloadString);
      await sendCapture(captureForm({ payloadString, signature, files }), (ev) => {
        if (ev.t === 'check') setChecks((c) => [...c, { id: ev.id, status: ev.status }]);
        else if (ev.t === 'verdict') {
          setVerdict(ev);
          void db.put('device', { ...device, nextSeq: device.nextSeq + 1, lastEventHash: payloadHash } satisfies DeviceRecord);
        } else if (ev.t === 'rejected') setMessage(`Not accepted: ${ev.reason.replaceAll('_', ' ')}.`);
        else setMessage('Could not reach the server. Nothing is lost; try again.');
      });
    } catch (err) {
      setMessage(`Could not send: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 480 }}>
      <h1>Tracer capture</h1>
      <form onSubmit={send}>
        <p>
          <label htmlFor="photo">Photo</label>{' '}
          <input
            id="photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files).slice(0, 3) : [])}
          />
        </p>
        <p>
          <label htmlFor="kg">Cherry (kg)</label>{' '}
          <input id="kg" type="number" inputMode="decimal" step="0.5" min="0.5" max="500" value={kg} onChange={(e) => setKg(e.target.value)} />
        </p>
        <button type="submit" disabled={busy || files.length === 0 || kg === ''}>
          Send
        </button>
      </form>

      {checks.length > 0 && (
        <ol aria-label="Checks" data-testid="checks">
          {checks.map((c) => (
            <li key={c.id}>
              {c.id}: {c.status}
            </li>
          ))}
        </ol>
      )}

      {verdict && (
        <section aria-live="polite">
          <h2 data-testid="verdict">{WORDS[verdict.verdict]}</h2>
          <p>Score {verdict.score.toFixed(1)}</p>
          <ul data-testid="evidence">
            {verdict.checks.map((c) => (
              <li key={c.id}>{c.evidence}</li>
            ))}
          </ul>
        </section>
      )}

      {message && <p role="status">{message}</p>}

      {signed && (
        <details>
          <summary>Signed payload</summary>
          <pre data-testid="signed-payload" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {signed}
          </pre>
        </details>
      )}
    </main>
  );
}

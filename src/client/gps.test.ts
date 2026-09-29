import { describe, expect, it, vi } from 'vitest';
import { startGpsWatch } from './gps';

// TSK-10.4 (TP13): the GPS watch starts with the record flow and keeps the best fix, so Submit uses a
// fix it already holds instead of waiting for one. A weak fix is reported, never blocking.

type Success = (p: GeolocationPosition) => void;
type Failure = (e: GeolocationPositionError) => void;

function fakeGeo() {
  let success: Success | undefined;
  let failure: Failure | undefined;
  const geo = {
    watchPosition: vi.fn((s: Success, f?: Failure | null, _opts?: PositionOptions) => {
      success = s;
      failure = f ?? undefined;
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  const fix = (lat: number, lng: number, accuracy: number) =>
    success!({ coords: { latitude: lat, longitude: lng, accuracy } as GeolocationCoordinates, timestamp: 0 } as GeolocationPosition);
  const fail = (code: number) => failure!({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  return { geo: geo as unknown as Geolocation, spy: geo, fix, fail };
}

describe('startGpsWatch', () => {
  it('calls watchPosition once, with high accuracy', () => {
    const f = fakeGeo();
    startGpsWatch(f.geo, () => 0);
    expect(f.spy.watchPosition).toHaveBeenCalledTimes(1);
    expect(f.spy.watchPosition.mock.calls[0]![2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('keeps the most accurate fix: 40 m then 12 m → the 12 m one', () => {
    const f = fakeGeo();
    let t = 1_000;
    const w = startGpsWatch(f.geo, () => t);
    expect(w.state()).toBe('finding');
    expect(w.best()).toBeNull();
    f.fix(12.42, 75.74, 40);
    t += 2_000;
    f.fix(12.4201, 75.7401, 12);
    t += 2_000;
    f.fix(12.4202, 75.7402, 25); // later but worse: the 12 m fix stays best
    expect(w.best()).toEqual({ lat: 12.4201, lng: 75.7401, accuracyM: 12, at: 3_000 });
    expect(w.state()).toBe('ok');
  });

  it('forgets fixes older than 60 s when a newer one exists', () => {
    const f = fakeGeo();
    let t = 0;
    const w = startGpsWatch(f.geo, () => t);
    f.fix(12.42, 75.74, 5);
    t = 61_000;
    f.fix(12.43, 75.75, 50);
    expect(w.best()).toMatchObject({ accuracyM: 50, at: 61_000 });
  });

  it('reports weak when the best fix is 100 m or worse, without blocking', () => {
    const f = fakeGeo();
    const w = startGpsWatch(f.geo, () => 0);
    f.fix(12.42, 75.74, 150);
    expect(w.state()).toBe('weak');
    expect(w.best()).toMatchObject({ accuracyM: 150 });
  });

  it('waitForFresh answers at once with a fresh fix, and waits for the next one when the held fix is older than 10 s', async () => {
    const f = fakeGeo();
    let t = 0;
    const w = startGpsWatch(f.geo, () => t);
    f.fix(12.42, 75.74, 10);
    t = 5_000;
    await expect(w.waitForFresh()).resolves.toMatchObject({ accuracyM: 10, at: 0 });

    t = 11_000; // the held fix is now 11 s old
    let settled = false;
    const p = w.waitForFresh().then((x) => {
      settled = true;
      return x;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    f.fix(12.4201, 75.7401, 20);
    await expect(p).resolves.toMatchObject({ accuracyM: 20, at: 11_000 });
  });

  it('waitForFresh gives up after maxMs with the best fix it has (or null)', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeGeo();
      const w = startGpsWatch(f.geo, () => 0);
      const p = w.waitForFresh(10_000);
      vi.advanceTimersByTime(10_000);
      await expect(p).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a permission error → denied; onChange hears it', () => {
    const f = fakeGeo();
    const w = startGpsWatch(f.geo, () => 0);
    const seen: string[] = [];
    const off = w.onChange(() => seen.push(w.state()));
    f.fail(1);
    expect(w.state()).toBe('denied');
    expect(seen).toEqual(['denied']);
    off();
    f.fix(12.42, 75.74, 10);
    expect(seen).toEqual(['denied']);
  });

  it('stop() clears the watch', () => {
    const f = fakeGeo();
    const w = startGpsWatch(f.geo, () => 0);
    w.stop();
    expect(f.spy.clearWatch).toHaveBeenCalledWith(7);
  });

  it('no geolocation at all → denied, and nothing throws', () => {
    const w = startGpsWatch(undefined, () => 0);
    expect(w.state()).toBe('denied');
    expect(() => w.stop()).not.toThrow();
  });
});

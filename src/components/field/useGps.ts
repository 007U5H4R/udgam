'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { startGpsWatch, type Fix, type GpsState, type GpsWatch } from '../../client/gps';

// The GPS watch as React state (TP13): it starts when the screen mounts, stops when it unmounts, and
// re-renders on every new fix or state. `watch()` hands Submit the running watch (best / waitForFresh).

const SERVER = 'finding|null';

export function useGps(): { state: GpsState; fix: Fix | null; watch: () => GpsWatch | null } {
  const ref = useRef<GpsWatch | null>(null);
  const subscribe = useCallback((onChange: () => void) => {
    const w = startGpsWatch();
    ref.current = w;
    const off = w.onChange(onChange);
    onChange();
    return () => {
      off();
      w.stop();
      if (ref.current === w) ref.current = null;
    };
  }, []);
  const snapshot = useCallback(() => {
    const w = ref.current;
    return w ? `${w.state()}|${JSON.stringify(w.best())}` : SERVER;
  }, []);
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  const bar = snap.indexOf('|');
  const watch = useCallback(() => ref.current, []);
  return { state: snap.slice(0, bar) as GpsState, fix: JSON.parse(snap.slice(bar + 1)) as Fix | null, watch };
}

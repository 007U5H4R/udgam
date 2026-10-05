'use client';

import { useEffect, useState } from 'react';

// QA-P5-7: true once this component has mounted in the browser (an effect never runs on the server), so
// a test can wait for the photo inputs' handlers before choosing a file.

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the one render after mount is the point
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** The marker attribute: present (`data-hydrated="true"`) only after hydration. */
export const hydratedAttr = (hydrated: boolean): { 'data-hydrated'?: 'true' } => (hydrated ? { 'data-hydrated': 'true' } : {});

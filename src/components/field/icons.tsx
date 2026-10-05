import type { ReactNode } from 'react';

// The capture app's line icons (24 grid, 1.8 stroke), ported from the symbol set in
// final/index.html. Inline paths instead of an SVG sprite, so each icon renders on its own.
// Decorative: every icon sits next to its word (Design.md §17), so it is aria-hidden.

export type IconName =
  | 'camera'
  | 'check'
  | 'clock'
  | 'cloud'
  | 'location'
  | 'wifiOff'
  | 'arrowLeft'
  | 'arrowRight'
  | 'globe'
  | 'home'
  | 'list'
  | 'help'
  | 'tree'
  | 'seal'
  | 'delete'
  | 'retry'
  | 'ring'
  | 'trend'
  | 'chevron'
  | 'phone'
  | 'alert'
  | 'signOut';

const PATHS: Record<IconName, ReactNode> = {
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.3" r="3.4" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  cloud: <path d="M7.5 18.5h9.6a4 4 0 0 0 .5-7.96A5.5 5.5 0 0 0 7 9.7a4.4 4.4 0 0 0 .5 8.8z" />,
  location: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.6 16.1a5 5 0 0 1 6-.5" />
      <path d="M5.3 12.7a9.6 9.6 0 0 1 4.2-2.2" />
      <path d="M14 10.5a9.6 9.6 0 0 1 4.8 2.3" />
      <path d="M2 9.3a14.4 14.4 0 0 1 3.3-2.2" />
      <path d="M9.7 5.2A14.4 14.4 0 0 1 22 9.3" />
      <path d="M12 19.6h.01" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.6 3.5 5.5 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.5-3.5-8.5s1.1-5.9 3.5-8.5z" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.8" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.1-2.5 3.8" />
      <path d="M12 17.2h.01" strokeWidth="2.6" />
    </>
  ),
  tree: (
    <>
      <path d="M12 21v-6" />
      <path d="M12 3.5a5 5 0 0 1 4.9 4 4.2 4.2 0 0 1-1.4 8H8.5a4.2 4.2 0 0 1-1.4-8 5 5 0 0 1 4.9-4z" />
      <path d="M12 15l-2.5-2.5M12 13l2-2" />
    </>
  ),
  seal: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z" />
      <path d="M9 12l2.2 2.2L15.3 10" />
    </>
  ),
  delete: (
    <>
      <path d="M9 5.5h10.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9L3.5 12z" />
      <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" />
    </>
  ),
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </>
  ),
  ring: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
  // Not in the mockup's set: the "harvest size" evidence line, drawn in the same line style.
  trend: (
    <>
      <path d="M4 18.5h16" />
      <path d="M5.5 15l4-4.5 3.5 3 5.5-6.5" />
      <path d="M14.5 7h4v4" />
    </>
  ),
  // Stage 8 (DES-014, DES-016, DES-018, DES-021): drawn in the same line style.
  chevron: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  phone: <path d="M6.6 3.8h2.6l1.5 4-2 1.4a10.6 10.6 0 0 0 6.1 6.1l1.4-2 4 1.5v2.6a1.8 1.8 0 0 1-1.9 1.8A15.6 15.6 0 0 1 4.8 5.7a1.8 1.8 0 0 1 1.8-1.9z" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v5" />
      <path d="M12 16.2v.01" />
    </>
  ),
  signOut: (
    <>
      <path d="M14 4.5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h8" />
      <path d="M10.5 12h9.5M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
};

export function Ic({ name, className = 'ic' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

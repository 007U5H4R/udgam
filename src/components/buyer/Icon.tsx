// Icons for the batch screens, ported from the .design/exploration/final/admin.html symbol set
// (24 grid, 1.8 stroke, round caps). Decorative: always aria-hidden; the text beside them carries meaning.

const PATHS = {
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  seal: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z" />
      <path d="M9 12l2.2 2.2L15.3 10" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </>
  ),
  ring: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
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
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none' }}
    >
      {PATHS[name]}
    </svg>
  );
}

// The certificate's line icons (TKT-16), ported from the <symbol> sprite in
// .design/exploration/final/verify.html, inline so no <use> reference needs a sprite on the page. Every
// icon sits next to its word (Design.md §17) and is hidden from assistive technology.

export type CertIconName = 'check' | 'download' | 'print' | 'tree' | 'seal' | 'retry' | 'chevron' | 'ring' | 'key';

const PATHS: Record<CertIconName, React.ReactNode> = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10.5l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="3.5" y="9" width="17" height="7.5" rx="1.5" />
      <path d="M7 14h10v6H7z" />
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
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </>
  ),
  chevron: <path d="M6 9.5l6 6 6-6" />,
  ring: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L19 4M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
};

export function CertIcon({ name, className }: { name: CertIconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

export type CertMarkKind = 'ok' | 'check' | 'bad' | 'wait';

/**
 * The verdict marks of verify.html (`mk-ok` circle ✓, `mk-bad` square ✕, `mk-wait` dashed clock; `check`
 * is the shared amber diamond ! of VerdictChip, for a recorded "Needs a check"): shape
 * and word together, never colour alone (Design.md §17). `ok` is the only green on the page, and it is
 * rendered only after the visitor's browser verified the proof.
 */
export function CertMark({ kind, className }: { kind: CertMarkKind; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark={kind}>
      {kind === 'ok' ? (
        <>
          <circle cx="12" cy="12" r="11" fill="#7FE3A6" />
          <path d="M7 12.4l3.3 3.3L17 9" fill="none" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'check' ? (
        <>
          <path d="M12 1.2 22.8 12 12 22.8 1.2 12z" fill="#F2B84B" stroke="#F2B84B" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 7v6" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="16.6" r="1.4" fill="#0A0E0C" />
        </>
      ) : kind === 'bad' ? (
        <>
          <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#EF6A5B" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.6" />
          <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

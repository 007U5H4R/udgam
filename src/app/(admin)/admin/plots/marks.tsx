import type { RegistrationStatus } from '../../../../lib/plots/plots';

// Status marks and icons ported from final/admin.html's symbol set (mk-ok circle, mk-check diamond,
// mk-na dashed circle; i-plot, i-arrow-left, i-wifi-off, i-retry, i-ring). The word always sits beside a
// mark: status is never shown by colour alone.

export function StatusMark({ status, className }: { status: RegistrationStatus; className?: string }) {
  if (status === 'fresh') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#7FE3A6" />
        <path d="M7 12.4l3.3 3.3L17 9" fill="none" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'stale') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.2 22.8 12 12 22.8 1.2 12z" fill="#F2B84B" stroke="#F2B84B" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 7v6" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="1.4" fill="#0A0E0C" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#F3F6F4" strokeWidth="1.8" strokeDasharray="3 2.6" />
      <path d="M8 12h8" stroke="#F3F6F4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  plot: <path d="M5 7.5 11 4l8 3-1.5 9L10 20l-5.5-4z" />,
  back: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
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
  retry: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </>
  ),
  ring: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
  location: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
} as const;

export function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

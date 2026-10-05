'use client';

import { CertIcon } from '../../../../components/ui/CertIcon';
import c from './certificate.module.css';

// "Print certificate" (verify.html #print): the browser's print dialog; the light print stylesheet is
// TKT-17's (print.css). Before printing, every <details> opens, so the printed page has all the checks.

export function PrintButton({ label }: { label: string }) {
  function print() {
    for (const d of Array.from(document.querySelectorAll('details'))) d.open = true;
    window.print();
  }
  return (
    <button className={`${c.pill} ${c.ghost}`} type="button" id="print" onClick={print}>
      <CertIcon name="print" className={c.ic} />
      {label}
    </button>
  );
}

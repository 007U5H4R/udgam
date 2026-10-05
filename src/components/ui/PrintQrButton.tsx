'use client';

import s from './BatchQr.module.css';

// "Print QR" (TSK-16.7): prints the QR code and its URL on their own, in a small window of their own, so
// the admin's or buyer's screen around it is not printed. The window holds only the server-made SVG and
// the URL as text (no script). If a popup blocker refuses the window, the whole page prints instead.

export function PrintQrButton({ svg, url, label }: { svg: string; url: string; label: string }) {
  function print() {
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) {
      window.print();
      return;
    }
    const doc = w.document;
    doc.title = 'Certificate QR code';
    const box = doc.createElement('div');
    box.setAttribute('style', 'display:grid;justify-items:center;gap:12px;padding:24px;font:14px system-ui,sans-serif;color:#111');
    const code = doc.createElement('div');
    code.setAttribute('style', 'width:280px;height:280px');
    code.innerHTML = svg;
    const text = doc.createElement('p');
    text.setAttribute('style', 'margin:0;word-break:break-all;text-align:center');
    text.textContent = url;
    box.append(code, text);
    doc.body.append(box);
    w.focus();
    w.print();
  }
  return (
    <button type="button" className={s.print} onClick={print}>
      {label}
    </button>
  );
}

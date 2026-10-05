'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Sheet.module.css';

// The tinted bottom sheet (Design.md §13; final/index.html `dialog.sheet` + `.dlg-panel`, amber tint from
// `.sheet-panel`). A modal <dialog>: focus moves into it and stays there, the page behind is inert.
// Escape and a tap on the backdrop call `onClose`; the parent owns `open`.
// With a `footer` (DES-001) the content scrolls on its own and the footer (the sheet's way out) stays
// pinned at the bottom, always in view; while more content sits below the fold the content fades out at
// its bottom edge, so the sheet never looks finished when it is not.

export type SheetTone = 'default' | 'amber';

export function Sheet({
  open,
  onClose,
  labelledBy,
  tone = 'default',
  className,
  children,
  footer,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  /** The id of the sheet's heading. */
  labelledBy: string;
  tone?: SheetTone;
  className?: string;
  children: ReactNode;
  /** Pinned below the scrolling content (the Close pill). */
  footer?: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Is there content below the fold of the scrolling body? Measured on open, scroll and resize.
  useEffect(() => {
    const el = body.current;
    if (!open || !el) return;
    const measure = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    for (const c of el.children) ro?.observe(c);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [open, footer]);

  const panel = [styles.panel, tone === 'amber' ? styles.amber : '', footer ? styles.withFoot : '', className].filter(Boolean).join(' ');

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={labelledBy}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault(); // the parent closes it, so React state stays the truth
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // the backdrop, not the panel
      }}
    >
      <div className={panel}>
        <div className={styles.grabber} aria-hidden="true" />
        {footer ? (
          <>
            <div ref={body} className={styles.body} data-more={more ? 'true' : undefined} data-testid={testId ? `${testId}-body` : undefined}>
              {children}
            </div>
            <div className={styles.foot}>{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </dialog>
  );
}

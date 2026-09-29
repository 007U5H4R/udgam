'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

// The tinted bottom sheet (Design.md §13; final/index.html `dialog.sheet` + `.dlg-panel`, amber tint from
// `.sheet-panel`). A modal <dialog>: focus moves into it and stays there, the page behind is inert.
// Escape and a tap on the backdrop call `onClose`; the parent owns `open`.

export type SheetTone = 'neutral' | 'amber';

export function Sheet({
  open,
  onClose,
  labelledBy,
  tone = 'neutral',
  className,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  /** The id of the sheet's heading. */
  labelledBy: string;
  tone?: SheetTone;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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
      <div className={[styles.panel, tone === 'amber' ? styles.amber : '', className].filter(Boolean).join(' ')}>
        <div className={styles.grabber} aria-hidden="true" />
        {children}
      </div>
    </dialog>
  );
}

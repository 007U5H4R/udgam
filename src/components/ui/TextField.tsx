import type { InputHTMLAttributes } from 'react';
import styles from './TextField.module.css';

// A labelled single-line field (ported from the admin reason panel's label + text box). The label is
// always visible and tied to the input; `id` is required so the pairing never breaks.

export function TextField({ label, id, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={styles.input} {...rest} />
    </div>
  );
}

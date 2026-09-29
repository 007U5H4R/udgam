import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Pill.module.css';

// The pill button (Design.md §13, ported from final/index.html). One `primary` per screen (the only
// glowing control); `ghost` for secondary actions; `amber` for the retry sheet. `icon` goes before the
// words (every icon has a word, Design.md §17).

export type PillVariant = 'primary' | 'ghost' | 'amber';

export function Pill({
  variant = 'primary',
  className,
  type = 'button',
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PillVariant; icon?: ReactNode }) {
  const cls = [styles.pill, variant === 'primary' ? '' : styles[variant], className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

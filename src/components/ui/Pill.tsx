import type { ButtonHTMLAttributes } from 'react';
import styles from './Pill.module.css';

// The pill button (Design.md §13, ported from final/index.html). One `primary` per screen (the only
// glowing control); `ghost` for secondary actions; `amber` for the retry sheet.

export type PillVariant = 'primary' | 'ghost' | 'amber';

export function Pill({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PillVariant }) {
  const cls = [styles.pill, variant === 'primary' ? '' : styles[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}

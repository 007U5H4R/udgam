import type { HTMLAttributes } from 'react';
import styles from './GlassCard.module.css';

// The frosted card (Design.md §12–13, ported from final/index.html ".glass.card"): 28 px radius,
// --surface with a 20 px backdrop blur, a 1 px hairline, and the solid fallback without backdrop-filter.

export function GlassCard({
  as: Tag = 'div',
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'article' | 'section' }) {
  return <Tag className={[styles.glass, styles.card, className].filter(Boolean).join(' ')} {...rest} />;
}

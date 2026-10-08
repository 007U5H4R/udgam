import type { HTMLAttributes } from 'react';
import styles from './GlassCard.module.css';

// The frosted card (Design.md §12–13, ported from final/index.html ".glass.card"): 28 px radius,
// --surface with a 20 px backdrop blur, a 1 px hairline, and the solid fallback without backdrop-filter.
// `card={false}` keeps the glass without the card radius (rows, slots and check rows set their own).

export function GlassCard({
  as: Tag = 'div',
  className,
  card = true,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'article' | 'section' | 'ul' | 'ol' | 'li'; card?: boolean }) {
  return <Tag className={[styles.glass, card ? styles.card : '', className].filter(Boolean).join(' ')} {...rest} />;
}

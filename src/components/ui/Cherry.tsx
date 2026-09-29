import type { CSSProperties } from 'react';
import { VerdictMark, type MarkKind } from './VerdictChip';

// The brand object (Design.md §1, final/cherry.svg v2): the three-cherry cluster, ported from
// final/index.html `.cherry`. `tone` sets the rim light (green on Verified, amber on Needs a check,
// none on Not accepted — D5); `motion` is the one moment (`rise`, Verified only) or the checking
// screen's slow breathing glow. Both stop under prefers-reduced-motion (field.css).

export type CherryTone = 'green' | 'amber' | 'none';
export type CherryMotion = 'rise' | 'slow' | 'none';

export function Cherry({
  size,
  tone,
  motion = 'none',
  badge,
  className,
}: {
  /** Pixel size of the image; with a placement class (`float-top`, `chk-top`, `verdict-top`) the class sets `--cz`. */
  size: number;
  tone?: CherryTone;
  motion?: CherryMotion;
  /** The verdict mark drawn on the cluster (the word is always elsewhere on the screen). */
  badge?: MarkKind;
  className?: string;
}) {
  const cls = ['cherry', tone ?? '', motion !== 'none' ? motion : '', className].filter(Boolean).join(' ');
  const style = className ? undefined : ({ '--cz': `${size}px` } as CSSProperties);
  return (
    <div className={cls} style={style} data-testid="cherry">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here */}
      <img src="/brand/cherry.svg" alt="" width={size} height={size} />
      {badge ? <VerdictMark kind={badge} className="badge" /> : null}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Ic } from './icons';

// One photo thumbnail on a picking's detail (TSK-11.4). DES-017: a thumbnail that does not load shows a
// neutral tile with the camera icon and "Photo not available" instead of the browser's broken-image
// glyph; an image that failed before hydration (no error event left to hear) is caught on mount.
// DES-020: alt="" because the caption under the tile already names it ("Photo 1").

export function DetailThumb({ src, missing }: { src: string; missing: string }) {
  const img = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed)
    return (
      <span className="thumb-missing" data-testid="thumb-missing">
        <Ic name="camera" />
        {missing}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- the owner's own thumbnail, served by /api/media; no optimisation
  return <img ref={img} src={src} alt="" width={320} height={320} onError={() => setFailed(true)} />;
}

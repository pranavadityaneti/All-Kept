'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  alt: string;
  /** Shown while the file is missing from public/design — the design's
   *  own placeholder label. */
  placeholder: string;
};

// A picture slot that degrades to a labelled gradient when the file is not
// there yet, instead of a broken-image glyph.
export function SlotImage({ src, alt, placeholder }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);

  // The server renders the <img>, so a 404 can fire before React attaches
  // onError. Check the element's own state once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, [src]);

  return (
    <div className="slot">
      {missing ? (
        <div className="slot-fallback" aria-label={alt}>
          {placeholder}
        </div>
      ) : (
        <img ref={ref} src={src} alt={alt} onError={() => setMissing(true)} />
      )}
    </div>
  );
}

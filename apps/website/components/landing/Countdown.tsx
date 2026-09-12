'use client';

import { useEffect, useState } from 'react';

// Launch is 21 September 2026, midnight IST — the same instant the
// interest API reports as its launch date.
export const LAUNCH_AT = new Date('2026-09-21T00:00:00+05:30').getTime();

type Parts = { d: string; h: string; m: string; s: string };

const pad = (n: number) => String(n).padStart(2, '0');

function partsAt(now: number): Parts {
  const left = Math.max(0, LAUNCH_AT - now);
  return {
    d: pad(Math.floor(left / 86_400_000)),
    h: pad(Math.floor(left / 3_600_000) % 24),
    m: pad(Math.floor(left / 60_000) % 60),
    s: pad(Math.floor(left / 1000) % 60),
  };
}

// The server does not know the viewer's clock, so it renders dashes and the
// client fills in real digits after mount — no hydration mismatch.
export function Countdown() {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    const tick = () => setParts(partsAt(Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const units: Array<[keyof Parts, string]> = [
    ['d', 'days'],
    ['h', 'hours'],
    ['m', 'minutes'],
    ['s', 'seconds'],
  ];

  return (
    <div className="countdown" role="timer" aria-live="off">
      {units.map(([key, label], i) => (
        <span key={key} style={{ display: 'contents' }}>
          {i > 0 && (
            <span className="cd-sep" aria-hidden="true">
              :
            </span>
          )}
          <span className="cd-unit">
            <span className="cd-num">{parts ? parts[key] : '--'}</span>
            <span className="cd-label">{label}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

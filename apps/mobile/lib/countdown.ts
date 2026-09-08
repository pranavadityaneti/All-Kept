/** Whole seconds left until `iso`, never negative. */
export function secondsLeft(iso: string, now: number = Date.now()): number {
  const end = Date.parse(iso);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** m:ss for a countdown. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

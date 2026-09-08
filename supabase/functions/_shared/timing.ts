// Bounded waiting for work that keeps running after the wait ends.

export const TIMED_OUT: unique symbol = Symbol("timed out");

/** Resolves with the work's result if it settles within `ms`, otherwise with TIMED_OUT; the work itself is not cancelled. Rejections propagate. */
export function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  return Promise.race([work, ceiling]).finally(() => clearTimeout(timer));
}

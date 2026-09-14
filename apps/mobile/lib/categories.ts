/**
 * The colour arithmetic the category marks and chips share. A category's colours themselves live
 * in category-marks.ts, beside its mark, so a card and a chip can never disagree.
 */
/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The colour `t` of the way from `a` to `b`, as `#rrggbb`: 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((na >> shift) & 255) * (1 - t) + ((nb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((shift) => ch(shift).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

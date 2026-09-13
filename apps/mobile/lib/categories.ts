/**
 * A category's hue, for the filter chips. The mark itself lives in category-marks.ts — a Fluent
 * emoji per category — so this file no longer names a glyph for anything.
 */
export interface CategoryStyle { hue: string }

const HUE = "#6D46F2";

/** One hue for now; a category of your own may pick its own later. */
export const categoryStyle = (_name: string): CategoryStyle => ({ hue: HUE });

/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

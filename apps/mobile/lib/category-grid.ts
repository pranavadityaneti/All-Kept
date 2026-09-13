/**
 * How the category grid is laid out: two wide cards on top, three across below.
 *
 * The wide pair are the categories a person saves to regularly — a recency question, not an
 * all-time one, so they are ranked by the last thirty days and the pair can change month to month,
 * which is the point. When fewer than two have anything recent the all-time biggest stand in, so
 * the top row is never half empty for someone who has been away.
 */
import { expandable } from "./expandable";
import type { Facet } from "./filter-groups";

export interface Activity { category: string; n: number }

export const WIDE = 2;
export const REST_SHOWN = 6;

export function arrangeGrid(all: Facet, recent: readonly Activity[], open: boolean): { wide: Facet; rest: Facet; actionLabel?: "See all" | "Show less" } {
  const recentCount = new Map(recent.map((r) => [r.category, r.n]));
  const active = all.filter((c) => (recentCount.get(c.value) ?? 0) > 0)
    .sort((a, b) => (recentCount.get(b.value) ?? 0) - (recentCount.get(a.value) ?? 0) || b.n - a.n);
  const wide = (active.length >= WIDE ? active : all).slice(0, WIDE);
  const chosen = new Set(wide.map((c) => c.value));
  const remaining = all.filter((c) => !chosen.has(c.value));
  const { shown, actionLabel } = expandable(remaining, REST_SHOWN, open);
  return actionLabel ? { wide, rest: shown, actionLabel } : { wide, rest: shown };
}

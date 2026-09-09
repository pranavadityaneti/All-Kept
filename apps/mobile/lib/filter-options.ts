import { FILTER_LABEL } from "./platforms";
import type { Facets, Filters } from "./library";

export type FilterGroup = keyof Filters;

export interface FilterOption { value: string; label: string; n: number; selected: boolean }
export interface ActiveFilter { group: FilterGroup; value: string; label: string }

/** How a value reads on screen. A platform has a short name of its own; a category is already one. */
export const filterLabel = (group: FilterGroup, value: string): string =>
  group === "platforms" ? FILTER_LABEL[value] ?? value : value;

/**
 * Everything one group can offer.
 *
 * A chosen value stays on the list even when the counts no longer mention it — a category whose last
 * save was deleted, or one arrived at by link before the library held anything under it. An option
 * that is not on the list is a filter that cannot be switched off, and the library reads as empty
 * with nothing on screen to explain why.
 */
export function filterOptions(group: FilterGroup, facets: Facets | undefined, filters: Filters): FilterOption[] {
  const chosen = filters[group];
  const counted = (group === "platforms" ? facets?.platforms : facets?.categories) ?? [];
  const known = new Set(counted.map((f) => f.value));
  return [
    ...counted.map((f) => ({ value: f.value, label: filterLabel(group, f.value), n: f.n, selected: chosen.includes(f.value) })),
    ...chosen.filter((v) => !known.has(v)).map((v) => ({ value: v, label: filterLabel(group, v), n: 0, selected: true })),
  ];
}

/** What is switched on right now, in the order the sheet lists it. */
export function activeFilters(filters: Filters): ActiveFilter[] {
  return [
    ...filters.platforms.map((v) => ({ group: "platforms" as const, value: v, label: filterLabel("platforms", v) })),
    ...filters.categories.map((v) => ({ group: "categories" as const, value: v, label: filterLabel("categories", v) })),
  ];
}

export interface Matches {
  /** Saves under the current filters. A floor rather than a total when `more` is set. */
  n: number;
  more: boolean;
  pending: boolean;
}

/**
 * How many saves a selection matches, where the counts can answer it on their own.
 *
 * They are gathered one group at a time and say nothing about the overlap between two groups, so a
 * platform and a category chosen together has no answer here and has to be counted from the results
 * as they arrive. Within a group the values are alternatives, so their counts add up.
 */
export function exactMatches(facets: Facets | undefined, filters: Filters): number | null {
  if (!facets) return null;
  if (filters.platforms.length > 0 && filters.categories.length > 0) return null;
  const total = (counts: { value: string; n: number }[], chosen: string[]) =>
    counts.filter((f) => chosen.includes(f.value)).reduce((sum, f) => sum + f.n, 0);
  if (filters.platforms.length > 0) return total(facets.platforms, filters.platforms);
  if (filters.categories.length > 0) return total(facets.categories, filters.categories);
  return facets.platforms.reduce((sum, f) => sum + f.n, 0);
}

/** What the filters produced, said only as precisely as it is actually known. */
export function matchesLabel(matches: Matches): string {
  if (matches.pending) return "Counting…";
  if (matches.n === 0) return "No saves";
  if (matches.more) return `${matches.n}+ saves`;
  return matches.n === 1 ? "1 save" : `${matches.n} saves`;
}

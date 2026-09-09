import { FILTER_LABEL } from "./platforms";
import { FILTER_GROUPS, type Facets, type Filters } from "./filter-groups";

export type FilterGroup = keyof Filters;

/**
 * What a save is, in the words someone would use for it.
 *
 * "Reels & Shorts" is one bucket on purpose: a nine-by-sixteen video is the same thing to watch
 * whichever app it came from, and splitting it by platform is what the platform pills are for.
 */
export const SHAPE_LABEL: Record<string, string> = {
  vertical: "Reels & Shorts",
  wide: "Videos",
  post: "Posts & carousels",
  note: "Notes",
  link: "Links",
  other: "Other",
};

export const SHAPE_ICON: Record<string, string> = {
  vertical: "phone-portrait-outline",
  wide: "tv-outline",
  post: "images-outline",
  note: "document-text-outline",
  link: "link-outline",
  other: "ellipsis-horizontal",
};

/** Standing questions about a save rather than descriptions of it. */
export const FLAG_LABEL: Record<string, string> = {
  needs_attention: "Needs attention",
  repeated: "Saved more than once",
  noted: "Has a note",
};

export const FLAG_ICON: Record<string, string> = {
  needs_attention: "alert-circle-outline",
  repeated: "copy-outline",
  noted: "create-outline",
};

export interface FilterOption { value: string; label: string; n: number; selected: boolean }
export interface ActiveFilter { group: FilterGroup; value: string; label: string }

/** How a value reads on screen. A category is already a phrase; the rest are stored as keys. */
export function filterLabel(group: FilterGroup, value: string): string {
  if (group === "platforms") return FILTER_LABEL[value] ?? value;
  if (group === "shapes") return SHAPE_LABEL[value] ?? value;
  if (group === "flags") return FLAG_LABEL[value] ?? value;
  return value;
}

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
  const counted = facets?.[group] ?? [];
  const known = new Set(counted.map((f) => f.value));
  return [
    ...counted.map((f) => ({ value: f.value, label: filterLabel(group, f.value), n: f.n, selected: chosen.includes(f.value) })),
    ...chosen.filter((v) => !known.has(v)).map((v) => ({ value: v, label: filterLabel(group, v), n: 0, selected: true })),
  ];
}

/** What is switched on right now, in the order the sheet lists it. */
export function activeFilters(filters: Filters): ActiveFilter[] {
  return FILTER_GROUPS.flatMap((group) =>
    filters[group].map((value) => ({ group, value, label: filterLabel(group, value) })),
  );
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
  const narrowed = FILTER_GROUPS.filter((g) => filters[g].length > 0);
  // Two groups at once describes an overlap the counts know nothing about, so it has to be counted
  // from the results as they arrive rather than guessed at from here.
  if (narrowed.length > 1) return null;
  const only = narrowed[0];
  if (!only) return facets.platforms.reduce((sum, f) => sum + f.n, 0);
  const chosen = filters[only];
  return facets[only].filter((f) => chosen.includes(f.value)).reduce((sum, f) => sum + f.n, 0);
}

/** What the filters produced, said only as precisely as it is actually known. */
export function matchesLabel(matches: Matches): string {
  if (matches.pending) return "Counting…";
  if (matches.n === 0) return "No saves";
  if (matches.more) return `${matches.n}+ saves`;
  return matches.n === 1 ? "1 save" : `${matches.n} saves`;
}

// What the library can be narrowed by, with no runtime dependencies at all.
//
// Deliberately its own file rather than part of library.ts. These are plain shapes, but library.ts
// reaches Supabase and through it React Native, whose source uses Flow's `import typeof` — so any
// pure module that took a *value* from there became unreadable to the test runner. Kept here, the
// groups can be walked from anywhere, tests included.

export interface Filters { platforms: string[]; categories: string[]; shapes: string[]; flags: string[] }

/**
 * Every group, listed once.
 *
 * Walked rather than named wherever filters are read, so a fifth group cannot be added to the type
 * and then forgotten in the sheet, the counts, or the thing that remembers them between launches.
 */
export const FILTER_GROUPS = ["platforms", "categories", "shapes", "flags"] as const;

export const NO_FILTERS: Filters = { platforms: [], categories: [], shapes: [], flags: [] };

export const countFilters = (f: Filters): number => FILTER_GROUPS.reduce((n, g) => n + f[g].length, 0);

export type Facet = { value: string; n: number }[];
/** One tally per value in each group, for saying how many a filter would show before it is tapped. */
export interface Facets { platforms: Facet; categories: Facet; shapes: Facet; flags: Facet }

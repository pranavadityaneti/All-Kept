import { describe, expect, it } from "vitest";
import { activeFilters, exactMatches, filterOptions, matchesLabel } from "../lib/filter-options";
import type { Facets, Filters } from "../lib/library";

const facets: Facets = {
  platforms: [{ value: "instagram", n: 120 }, { value: "youtube", n: 8 }],
  categories: [{ value: "Food & recipes", n: 90 }, { value: "Money & career", n: 38 }],
};
const none: Filters = { platforms: [], categories: [] };

describe("filter options", () => {
  it("names platforms the short way and leaves a category as it is", () => {
    expect(filterOptions("platforms", facets, none).map((o) => o.label)).toEqual(["Instagram", "YouTube"]);
    expect(filterOptions("categories", facets, none).map((o) => o.label)).toEqual(["Food & recipes", "Money & career"]);
  });

  it("keeps a chosen value the counts no longer mention, so it can still be switched off", () => {
    const stale: Filters = { platforms: [], categories: ["Travel & places"] };
    const options = filterOptions("categories", facets, stale);
    expect(options.map((o) => o.value)).toContain("Travel & places");
    expect(options.find((o) => o.value === "Travel & places")).toMatchObject({ n: 0, selected: true });
  });

  it("offers what it can before the counts arrive rather than nothing at all", () => {
    const chosen: Filters = { platforms: ["instagram"], categories: [] };
    expect(filterOptions("platforms", undefined, chosen)).toEqual([{ value: "instagram", label: "Instagram", n: 0, selected: true }]);
    expect(filterOptions("categories", undefined, none)).toEqual([]);
  });

  it("lists what is switched on across both groups", () => {
    expect(activeFilters({ platforms: ["youtube"], categories: ["Money & career"] })).toEqual([
      { group: "platforms", value: "youtube", label: "YouTube" },
      { group: "categories", value: "Money & career", label: "Money & career" },
    ]);
  });
});

describe("how many saves the filters match", () => {
  it("adds the counts of alternatives within one group", () => {
    expect(exactMatches(facets, { platforms: ["instagram", "youtube"], categories: [] })).toBe(128);
    expect(exactMatches(facets, { platforms: [], categories: ["Money & career"] })).toBe(38);
    expect(exactMatches(facets, none)).toBe(128);
  });

  it("refuses to answer across two groups, where the counts say nothing about the overlap", () => {
    expect(exactMatches(facets, { platforms: ["instagram"], categories: ["Money & career"] })).toBeNull();
    expect(exactMatches(undefined, none)).toBeNull();
  });

  it("counts a chosen value the counts do not mention as nothing rather than skipping it", () => {
    expect(exactMatches(facets, { platforms: [], categories: ["Travel & places"] })).toBe(0);
  });

  it("says a number as a floor while more pages are still behind it", () => {
    expect(matchesLabel({ n: 30, more: true, pending: false })).toBe("30+ saves");
    expect(matchesLabel({ n: 12, more: false, pending: false })).toBe("12 saves");
    expect(matchesLabel({ n: 1, more: false, pending: false })).toBe("1 save");
    expect(matchesLabel({ n: 0, more: false, pending: false })).toBe("No saves");
    expect(matchesLabel({ n: 0, more: false, pending: true })).toBe("Counting…");
  });
});

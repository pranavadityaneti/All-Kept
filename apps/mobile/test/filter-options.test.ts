import { describe, expect, it } from "vitest";
import { activeFilters, exactMatches, filterLabel, filterOptions, matchesLabel } from "../lib/filter-options";
import type { Facets, Filters } from "../lib/filter-groups";

const facets: Facets = {
  platforms: [{ value: "instagram", n: 120 }, { value: "youtube", n: 8 }],
  categories: [{ value: "Food & recipes", n: 90 }, { value: "Money & career", n: 38 }],
  shapes: [{ value: "vertical", n: 14 }, { value: "post", n: 8 }],
  flags: [{ value: "needs_attention", n: 4 }],
};
// Spelled out rather than imported from lib/library: importing a *value* from there drags Supabase
// and React Native into the test, and React Native's own source uses Flow's `import typeof`, which
// the test runner's parser will not read. The type still comes from there, so a new group added to
// Filters fails this file until it is accounted for here too.
const none: Filters = { platforms: [], categories: [], shapes: [], flags: [] };

describe("filter options", () => {
  it("shows the short name for a category, while the long one stays the stored value", () => {
    expect(filterOptions("platforms", facets, none).map((o) => o.label)).toEqual(["Instagram", "YouTube"]);
    // The classifier works in "Money & career"; a person reads "Career". The value is untouched, so
    // the filter still matches — only what is drawn changes.
    expect(filterOptions("categories", facets, none).map((o) => o.label)).toEqual(["Food", "Career"]);
    expect(filterOptions("categories", facets, none).map((o) => o.value)).toEqual(["Food & recipes", "Money & career"]);
  });

  it("keeps a chosen value the counts no longer mention, so it can still be switched off", () => {
    const stale: Filters = { ...none, platforms: [], categories: ["Travel & places"] };
    const options = filterOptions("categories", facets, stale);
    expect(options.map((o) => o.value)).toContain("Travel & places");
    expect(options.find((o) => o.value === "Travel & places")).toMatchObject({ n: 0, selected: true });
  });

  it("offers what it can before the counts arrive rather than nothing at all", () => {
    const chosen: Filters = { ...none, platforms: ["instagram"], categories: [] };
    expect(filterOptions("platforms", undefined, chosen)).toEqual([{ value: "instagram", label: "Instagram", n: 0, selected: true }]);
    expect(filterOptions("categories", undefined, none)).toEqual([]);
  });

  it("lists what is switched on across both groups", () => {
    expect(activeFilters({ ...none, platforms: ["youtube"], categories: ["Money & career"] })).toEqual([
      { group: "platforms", value: "youtube", label: "YouTube" },
      { group: "categories", value: "Money & career", label: "Career" },
    ]);
  });
});

describe("how many saves the filters match", () => {
  it("adds the counts of alternatives within one group", () => {
    expect(exactMatches(facets, { ...none, platforms: ["instagram", "youtube"], categories: [] })).toBe(128);
    expect(exactMatches(facets, { ...none, platforms: [], categories: ["Money & career"] })).toBe(38);
    expect(exactMatches(facets, none)).toBe(128);
  });

  it("refuses to answer across two groups, where the counts say nothing about the overlap", () => {
    expect(exactMatches(facets, { ...none, platforms: ["instagram"], categories: ["Money & career"] })).toBeNull();
    expect(exactMatches(undefined, none)).toBeNull();
  });

  it("counts a chosen value the counts do not mention as nothing rather than skipping it", () => {
    expect(exactMatches(facets, { ...none, platforms: [], categories: ["Travel & places"] })).toBe(0);
  });

  it("says a number as a floor while more pages are still behind it", () => {
    expect(matchesLabel({ n: 30, more: true, pending: false })).toBe("30+ saves");
    expect(matchesLabel({ n: 12, more: false, pending: false })).toBe("12 saves");
    expect(matchesLabel({ n: 1, more: false, pending: false })).toBe("1 save");
    expect(matchesLabel({ n: 0, more: false, pending: false })).toBe("No saves");
    expect(matchesLabel({ n: 0, more: false, pending: true })).toBe("Counting…");
  });

  it("names a shape and a flag in the words someone would use, not the keys they are stored as", () => {
    expect(filterOptions("shapes", facets, none).map((o) => o.label)).toEqual(["Reels & Shorts", "Posts & carousels"]);
    expect(filterOptions("flags", facets, none).map((o) => o.label)).toEqual(["Needs attention"]);
  });

  it("gathers what is switched on across every group, not just the first two", () => {
    const all: Filters = { platforms: ["youtube"], categories: ["Money & career"], shapes: ["vertical"], flags: ["needs_attention"] };
    expect(activeFilters(all).map((f) => `${f.group}:${f.label}`)).toEqual([
      "platforms:YouTube", "categories:Career", "shapes:Reels & Shorts", "flags:Needs attention",
    ]);
  });

  it("counts a shape on its own but refuses to guess where two groups overlap", () => {
    expect(exactMatches(facets, { ...none, shapes: ["vertical"] })).toBe(14);
    expect(exactMatches(facets, { ...none, flags: ["needs_attention"] })).toBe(4);
    // Reels *and* from YouTube is an overlap the tallies say nothing about; it has to be counted
    // from the results instead of added up from here.
    expect(exactMatches(facets, { ...none, shapes: ["vertical"], platforms: ["youtube"] })).toBeNull();
  });

  it("still offers a shape that was chosen before its last save was deleted", () => {
    const stale: Filters = { ...none, shapes: ["note"] };
    const options = filterOptions("shapes", facets, stale);
    // Otherwise it is a filter with nothing on screen to switch it off, and the library reads empty.
    expect(options.find((o) => o.value === "note")).toEqual({ value: "note", label: "Notes", n: 0, selected: true });
  });
});

describe("one name everywhere", () => {
  it("gives the bar, the tokens and the sheet the same words", () => {
    // The bug this replaced: the sheet shortened the label itself, so a filter set from a button
    // reading "Style" then described itself as "Style & fashion" on the bar beside it.
    expect(filterLabel("categories", "Style & fashion")).toBe("Style");
    expect(filterOptions("categories", { ...facets, categories: [{ value: "Style & fashion", n: 3 }] }, none)[0]!.label).toBe("Style");
    expect(activeFilters({ ...none, categories: ["Style & fashion"] })[0]!.label).toBe("Style");
  });

  it("still shows a category it has no short name for, rather than nothing", () => {
    // Facets emit synthetic values like these; an unknown one must read as itself.
    expect(filterLabel("categories", "Needs attention")).toBe("Needs attention");
    expect(filterLabel("categories", "Sorting")).toBe("Sorting");
  });
});

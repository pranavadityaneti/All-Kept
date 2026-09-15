import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: async () => ({ data: null, error: null }) } } }));
import { factsFor, headerNames, shouldShowSummary } from "../lib/category-summary";
import { NO_FILTERS } from "../lib/filter-groups";
import type { CategorySummaryResponse } from "@allkept/contracts";

const tech: CategorySummaryResponse = {
  count: 77, shapes: { link: 2, post: 23, vertical: 31, wide: 21 }, intents: { buy: 2, read: 4, try: 13, watch: 43 },
  names: [
    { name: "Claude", kind: "tool", icon: "chatbubbles", n: 14 }, { name: "Claude Code", kind: "tool", icon: "code-slash", n: 7 },
    { name: "Codex", kind: "tool", icon: "code-slash", n: 3 }, { name: "GitHub", kind: "tool", icon: "git-branch", n: 3 },
    { name: "YouTube", kind: "brand", icon: "tv", n: 5 }, { name: "Tech", kind: "other", icon: null, n: 4 },
  ],
  themes: ["Claude Code workflows and agent setups", "Codex for refactors", "Tools people are trying"], freshness: "stored",
};

describe("when the summary shows", () => {
  it("is only when exactly one category is chosen and nothing else", () => {
    expect(shouldShowSummary({ ...NO_FILTERS, categories: ["Tech & tools"] })).toBe("Tech & tools");
    expect(shouldShowSummary(NO_FILTERS)).toBeNull();
    expect(shouldShowSummary({ ...NO_FILTERS, categories: ["Tech & tools", "Entertainment"] })).toBeNull();
    expect(shouldShowSummary({ ...NO_FILTERS, categories: ["Tech & tools"], platforms: ["instagram"] })).toBeNull();
    expect(shouldShowSummary({ ...NO_FILTERS, categories: ["Tech & tools"], flags: ["noted"] })).toBeNull();
  });
});

describe("the facts row", () => {
  it("says how many, mostly what when there is a clear majority, and the top two intents", () => {
    expect(factsFor(tech)).toBe("77 saves · 43 to watch · 13 to try");
    expect(factsFor({ ...tech, count: 10, shapes: { vertical: 8, post: 2 }, intents: { try: 3 } })).toBe("10 saves · mostly reels · 3 to try");
    expect(factsFor({ ...tech, count: 4, shapes: { wide: 4 }, intents: {} })).toBe("4 saves · all videos");
    expect(factsFor({ ...tech, count: 1, shapes: { post: 1 }, intents: { buy: 1 } })).toBe("1 save · 1 to buy");
  });
  it("leaves out an intent that only one save carries when there are many, so a stray guess is not a headline", () => {
    expect(factsFor({ ...tech, count: 30, shapes: {}, intents: { watch: 20, buy: 1 } })).toBe("30 saves · 20 to watch");
  });
});

describe("the names in the header", () => {
  it("folds a thread's spellings into one, drops platforms and category names, and keeps three", () => {
    const names = headerNames(tech, []);
    expect(names.map((n) => [n.name, n.n])).toEqual([["Claude", 21], ["Codex", 3], ["GitHub", 3]]);
    expect(names[0]!.icon).toBe("chatbubbles");
  });
  it("drops a category of the person's own by name, as the interests row does", () => {
    const withOwn = { ...tech, names: [...tech.names, { name: "Wedding", kind: "other", icon: null, n: 9 }] };
    expect(headerNames(withOwn, ["Wedding"]).map((n) => n.name)).toEqual(["Claude", "Codex", "GitHub"]);
  });
});

describe("asking again while the themes are being written", () => {
  it("asks four times more, further apart each time, then stops; a finished answer is never asked again", async () => {
    const { nextRefetchMs } = await import("../lib/category-summary");
    expect([1, 2, 3, 4, 5, 9].map((n) => nextRefetchMs("writing", n))).toEqual([3000, 7000, 15000, 25000, false, false]);
    for (const f of ["stored", "none"] as const) expect(nextRefetchMs(f, 1)).toBe(false);
    expect(nextRefetchMs(undefined, 0)).toBe(false);
  });
});

describe("the language the themes are written in", () => {
  it("is the phone's, as a plain code, and English when the phone will not say", async () => {
    const { languageFromLocale } = await import("../lib/category-summary");
    expect(languageFromLocale("en-US")).toBe("en");
    expect(languageFromLocale("ja-JP")).toBe("ja");
    expect(languageFromLocale("pt-BR")).toBe("pt");
    expect(languageFromLocale("zh-Hant-TW")).toBe("zh");
    expect(languageFromLocale("")).toBe("en");
    expect(languageFromLocale(undefined)).toBe("en");
  });
});

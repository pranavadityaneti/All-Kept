import { describe, expect, it } from "vitest";
import { rankInterests, type InterestRow } from "../lib/interests";

const now = new Date("2026-09-13T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const row = (name: string, n: number, lastDays: number, crossedDays: number | null = lastDays + 10): InterestRow => ({
  name, kind: "tool", n, last_saved_at: daysAgo(lastDays), crossed_at: crossedDays === null ? null : daysAgo(crossedDays), category: "Tech",
});

describe("one thread, not two", () => {
  it("folds a name that contains another into the one saved more, adding the counts", () => {
    // "Claude" and "Claude Code" are the same thread. Claude has more saves, so it keeps the label.
    const out = rankInterests([row("Claude", 5, 1), row("Claude Code", 4, 0)], { taken: [], now });
    expect(out.map((i) => [i.name, i.n])).toEqual([["Claude", 9]]);
  });

  it("keeps the fuller name when that is the one saved more", () => {
    // Six saves name Ariana Grande, two say only Ariana. The full name is the better label.
    const out = rankInterests([row("Ariana", 3, 1), row("Ariana Grande", 6, 0)], { taken: [], now });
    expect(out.map((i) => [i.name, i.n])).toEqual([["Ariana Grande", 9]]);
  });

  it("only folds on a whole word, so Java does not swallow JavaScript", () => {
    const out = rankInterests([row("Java", 4, 0), row("JavaScript", 4, 0)], { taken: [], now });
    expect(out.map((i) => i.name).sort()).toEqual(["Java", "JavaScript"]);
  });

  it("lets a fold lift a name over the floor, since together they are one interest", () => {
    const out = rankInterests([row("Claude", 2, 1), row("Claude Code", 2, 0)], { taken: [], now });
    expect(out.map((i) => [i.name, i.n])).toEqual([["Claude", 4]]);
  });

  it("dates the merged thread from whichever part crossed the floor first", () => {
    const out = rankInterests([row("Claude", 5, 1, 30), row("Claude Code", 4, 0, 2)], { taken: [], now });
    expect(out[0]?.crossedAt).toBe(daysAgo(30));
  });

  it("takes the most recent save of either part", () => {
    const out = rankInterests([row("Claude", 5, 9), row("Claude Code", 4, 0)], { taken: [], now });
    expect(out[0]?.lastSavedAt).toBe(daysAgo(0));
  });
});

describe("the mark a folded thread wears", () => {
  it("keeps the mark of the name that kept the label, and takes the other's when it has none", () => {
    const withIcon = (name: string, n: number, icon: string | null) => ({ ...row(name, n, 0), icon });
    expect(rankInterests([withIcon("Claude", 5, "chatbubbles"), withIcon("Claude Code", 4, "code-slash")], { taken: [], now })[0]!.icon).toBe("chatbubbles");
    expect(rankInterests([withIcon("Claude", 5, null), withIcon("Claude Code", 4, "code-slash")], { taken: [], now })[0]!.icon).toBe("code-slash");
    expect(rankInterests([withIcon("Claude", 5, null), withIcon("Claude Code", 4, null)], { taken: [], now })[0]!.icon).toBeNull();
  });
});

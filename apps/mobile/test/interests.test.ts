import { describe, expect, it } from "vitest";
import { INTEREST_FLOOR, MIN_TO_SHOW, NEW_FOR_DAYS, interestStyle, isNewInterest, rankInterests, showInterests, type InterestRow } from "../lib/interests";

const now = new Date("2026-09-13T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const row = (name: string, n: number, lastDays: number, extra: Partial<InterestRow> = {}): InterestRow => ({
  name, kind: "person", n, last_saved_at: daysAgo(lastDays), crossed_at: daysAgo(lastDays + 10), category: "Entertainment", ...extra,
});

describe("ranking interests", () => {
  it("keeps the floor even if the database were lenient", () => {
    expect(INTEREST_FLOOR).toBe(3);
    const out = rankInterests([row("Minecraft", 2, 1), row("Ariana Grande", 3, 1)], { taken: [], now });
    expect(out.map((i) => i.name)).toEqual(["Ariana Grande"]);
  });

  it("never shows an interest that reads like a category, in either spelling or any casing", () => {
    const rows = [row("Tech", 9, 1), row("tech & tools", 9, 1), row("Wedding ideas", 9, 1), row("Sorting", 9, 1), row("Harry Potter", 5, 1)];
    const out = rankInterests(rows, { taken: ["Tech & tools", "Tech", "Wedding ideas", "Sorting"], now });
    expect(out.map((i) => i.name)).toEqual(["Harry Potter"]);
  });

  it("never shows a platform as an interest", () => {
    const out = rankInterests([row("Instagram", 40, 0, { kind: "brand" }), row("TikTok", 12, 0, { kind: "brand" }), row("Minecraft", 4, 0)], { taken: [], now });
    expect(out.map((i) => i.name)).toEqual(["Minecraft"]);
  });

  it("nudges a recent thread above an older one with a slightly bigger count", () => {
    // Four saves, the last of them three months ago, against three saves with one today.
    const out = rankInterests([row("Old Band", 4, 95), row("New Band", 3, 0)], { taken: [], now });
    expect(out.map((i) => i.name)).toEqual(["New Band", "Old Band"]);
  });

  it("still lets a much bigger count win over recency", () => {
    const out = rankInterests([row("Big", 12, 95), row("Small", 3, 0)], { taken: [], now });
    expect(out.map((i) => i.name)).toEqual(["Big", "Small"]);
  });

  it("cuts the list at the limit after suppression, not before", () => {
    const rows = [row("Instagram", 50, 0, { kind: "brand" }), row("A", 5, 0), row("B", 4, 0), row("C", 3, 0)];
    expect(rankInterests(rows, { taken: [], now, limit: 2 }).map((i) => i.name)).toEqual(["A", "B"]);
  });
});

describe("a new interest", () => {
  it("is one that crossed the floor within the last week", () => {
    expect(NEW_FOR_DAYS).toBe(7);
    expect(isNewInterest({ crossedAt: daysAgo(2) }, now)).toBe(true);
    expect(isNewInterest({ crossedAt: daysAgo(9) }, now)).toBe(false);
    expect(isNewInterest({ crossedAt: null }, now)).toBe(false);
  });
});

describe("whether the row appears at all", () => {
  it("needs three interests, so one lonely pill never reads as a broken row", () => {
    expect(MIN_TO_SHOW).toBe(3);
    const two = rankInterests([row("A", 3, 0), row("B", 3, 0)], { taken: [], now });
    const three = rankInterests([row("A", 3, 0), row("B", 3, 0), row("C", 3, 0)], { taken: [], now });
    expect(showInterests(two)).toBe(false);
    expect(showInterests(three)).toBe(true);
  });
});

describe("how a pill is drawn", () => {
  it("gives every kind of thing its own colour and its own mark, so a person and a place never look alike", () => {
    const kinds = ["person", "brand", "product", "place", "recipe", "tool", "other"];
    const styles = kinds.map((k) => interestStyle(k));
    expect(new Set(styles.map((s) => s.hue)).size).toBe(kinds.length);
    expect(new Set(styles.map((s) => s.glyph)).size).toBe(kinds.length);
    // The marks are filled glyphs, tinted in the pill's own colour; an outline would read as a button.
    for (const s of styles) expect(s.glyph).not.toMatch(/-outline$/);
    expect(interestStyle("person").glyph).toBe("person-circle");
    expect(interestStyle("place").glyph).toBe("navigate");
  });
  it("draws a kind it has never heard of the way it draws 'other', rather than blank", () => {
    expect(interestStyle("galaxy")).toEqual(interestStyle("other"));
  });
});

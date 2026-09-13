import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@allkept/contracts";
import { DEFAULT_MARK, LEGACY_GLYPHS, MARK_KEYS, PICKER_MARKS, builtInMark, categoryMark, markFor } from "../lib/category-marks";

describe("marks", () => {
  it("gives every built-in category a mark of its own, not the default", () => {
    for (const c of CATEGORIES) if (c !== "Other") expect(builtInMark(c), c).not.toBe(DEFAULT_MARK);
  });

  it("maps every glyph the first version could store to a real mark, so nobody's choice is lost", () => {
    expect(LEGACY_GLYPHS.length).toBe(38);
    for (const glyph of LEGACY_GLYPHS) expect(markFor(glyph), glyph).not.toBe(DEFAULT_MARK);
  });

  it("draws the default for a value it does not recognise rather than nothing", () => {
    expect(markFor("not-a-mark")).toBe(DEFAULT_MARK);
    expect(markFor(null)).toBe(DEFAULT_MARK);
  });

  it("prefers the chosen mark over the built-in", () => {
    expect(categoryMark("Wedding", "ring")).toBe("ring");
    expect(categoryMark("Food & recipes", null)).toBe("cooking");
  });

  it("offers only marks that exist, and none of the fifteen's own", () => {
    const own = new Set(CATEGORIES.map((c) => builtInMark(c)));
    for (const k of PICKER_MARKS) { expect(MARK_KEYS).toContain(k); expect(own.has(k), k).toBe(false); }
    expect(PICKER_MARKS.length).toBeGreaterThan(40);
  });
});

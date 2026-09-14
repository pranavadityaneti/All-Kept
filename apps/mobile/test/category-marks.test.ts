import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@allkept/contracts";
import {
  DEFAULT_MARK, DEFAULT_PALETTE, LEGACY_EMOJI, LEGACY_GLYPHS, MARK_KEYS, PICKER_MARKS,
  builtInMark, categoryMark, categoryPalette, darkPalette, markFor, svgUri,
} from "../lib/category-marks";
import { MARK_SVGS } from "../lib/mark-svgs";

describe("marks", () => {
  it("gives every built-in category a mark of its own, not the default, and no two the same", () => {
    const marks = CATEGORIES.map((c) => builtInMark(c));
    for (const [i, c] of CATEGORIES.entries()) if (c !== "Other") expect(marks[i], c).not.toBe(DEFAULT_MARK);
    expect(new Set(marks).size).toBe(CATEGORIES.length);
  });

  it("maps every glyph the first version could store, and every emoji the second did, to a real mark, so nobody's choice is lost", () => {
    expect(LEGACY_GLYPHS.length).toBe(38);
    expect(LEGACY_EMOJI.length).toBe(74);
    for (const glyph of LEGACY_GLYPHS) expect(MARK_KEYS, glyph).toContain(markFor(glyph));
    for (const emoji of LEGACY_EMOJI) expect(MARK_KEYS, emoji).toContain(markFor(emoji));
    // A choice that meant something keeps meaning it: the old laptop is the new laptop, the old dog a dog.
    expect(markFor("laptop")).toBe("laptop");
    expect(markFor("dog_face")).toBe("dog-1");
    expect(markFor("bed-outline")).toBe("hotel-bed-5");
  });

  it("draws the default for a value it does not recognise rather than nothing", () => {
    expect(markFor("not-a-mark")).toBe(DEFAULT_MARK);
    expect(markFor(null)).toBe(DEFAULT_MARK);
    expect(MARK_KEYS).toContain(DEFAULT_MARK);
  });

  it("prefers the chosen mark over the built-in", () => {
    expect(categoryMark("Wedding", "diamond-1")).toBe("diamond-1");
    expect(categoryMark("Wedding", "ring")).toBe("diamond-1"); // the emoji ring, chosen last week
    expect(categoryMark("Food & recipes", null)).toBe("fork-knife");
  });

  it("offers only marks that exist, none of the fifteen's own, and enough to choose from", () => {
    const own = new Set(CATEGORIES.map((c) => builtInMark(c)));
    for (const k of PICKER_MARKS) { expect(MARK_KEYS).toContain(k); expect(own.has(k), k).toBe(false); }
    expect(new Set(PICKER_MARKS).size).toBe(PICKER_MARKS.length);
    expect(PICKER_MARKS.length).toBeGreaterThan(40);
  });
});

describe("the picture behind each mark", () => {
  it("exists for every key, built from the placeholders and nothing else in the way of colour", () => {
    let twoTone = 0;
    for (const k of MARK_KEYS) {
      const body = MARK_SVGS[k];
      expect(body, k).toBeTruthy();
      expect(body.includes("{ink}") || body.includes("{wash}"), k).toBe(true);
      expect(body, k).not.toMatch(/#[0-9a-f]{6}/i);
      // Base64 through btoa needs plain ASCII; a body that is not would throw on the phone.
      expect(/^[\x00-\x7F]*$/.test(body), k).toBe(true);
      if (body.includes("{ink}") && body.includes("{wash}")) twoTone++;
    }
    // A few marks (the plane) are one shade; the set is two-tone.
    expect(twoTone).toBeGreaterThan(MARK_KEYS.length * 0.9);
  });

  it("is drawn as an SVG data URI with the pair filled in and no placeholder left", () => {
    const uri = svgUri("laptop", { ink: "#3C43B8", wash: "#8F95F0" });
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = atob(uri.slice("data:image/svg+xml;base64,".length));
    expect(svg).toContain('viewBox="0 0 48 48"');
    expect(svg).toContain("#3C43B8");
    expect(svg).toContain("#8F95F0");
    expect(svg).not.toContain("{ink}");
    expect(svg).not.toContain("{wash}");
  });
});

describe("colour", () => {
  it("gives every built-in category a pastel and a pair of its own", () => {
    const cards = CATEGORIES.map((c) => categoryPalette(c).card);
    expect(new Set(cards).size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) {
      const { card, ink, wash } = categoryPalette(c);
      expect([card, ink, wash].every((v) => /^#[0-9A-Fa-f]{6}$/.test(v)), c).toBe(true);
      expect(ink, c).not.toBe(wash);
    }
  });

  it("gives a category of your own a palette from the same fifteen, the same one every time, and spreads names out", () => {
    expect(categoryPalette("Wedding")).toEqual(categoryPalette("Wedding"));
    const fifteen = new Set(CATEGORIES.map((c) => categoryPalette(c).card));
    const names = ["Wedding", "Kids", "Garden", "Cars", "Podcasts", "Books", "Coffee", "Running", "Hiking", "Photography", "Crypto", "Gifts"];
    const cards = names.map((n) => categoryPalette(n).card);
    for (const card of cards) expect(fifteen.has(card)).toBe(true);
    expect(new Set(cards).size).toBeGreaterThanOrEqual(7);
    expect(categoryPalette("")).toEqual(DEFAULT_PALETTE);
  });

  it("has a dark-theme reading of every palette that is not the light one", () => {
    for (const c of CATEGORIES) {
      const light = categoryPalette(c);
      const dark = darkPalette(light);
      expect(dark.card).not.toBe(light.card);
      expect([dark.card, dark.ink, dark.wash].every((v) => /^#[0-9A-Fa-f]{6}$/.test(v)), c).toBe(true);
    }
  });
});

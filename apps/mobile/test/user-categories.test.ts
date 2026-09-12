import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@allkept/contracts";
import { CATEGORY_ICONS, categoryIcon, DEFAULT_CATEGORY_ICON } from "../lib/category-icons";
import { checkCategoryName, nameProblemMessage } from "../lib/user-categories";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";

const font = glyphs as Record<string, number>;
const mine = ["Wedding", "Baby names"];

const problem = (raw: string, existing = mine) => {
  const result = checkCategoryName(raw, existing);
  return "problem" in result ? result.problem : null;
};
const accepted = (raw: string, existing = mine) => {
  const result = checkCategoryName(raw, existing);
  return "name" in result ? result.name : null;
};

describe("naming a category", () => {
  it("accepts an ordinary name and keeps it trimmed", () => {
    expect(accepted("  Wedding gifts  ")).toBe("Wedding gifts");
  });

  it("refuses a name that is only whitespace", () => {
    expect(problem("   ")).toBe("empty");
    expect(problem("")).toBe("empty");
  });

  it("refuses a name too long for a tile", () => {
    expect(accepted("a".repeat(24))).toBe("a".repeat(24));
    expect(problem("a".repeat(25))).toBe("too-long");
  });

  it("refuses the three labels the database invents for a save with no category", () => {
    for (const reserved of ["Sorting", "sorting", "Uncategorized", "needs attention"]) {
      expect(problem(reserved), reserved).toBe("reserved");
    }
  });

  it("refuses a name Allkept already sorts into, whatever the casing", () => {
    for (const built of CATEGORIES) expect(problem(built), built).toBe("taken");
    expect(problem("food & recipes")).toBe("taken");
  });

  it("refuses a name that reads the same as a built-in on screen, not just in storage", () => {
    // "Tech & tools" is drawn as "Tech". A category called "Tech" would put two tiles on the home
    // grid with the same label and no way to tell which was which.
    expect(problem("Tech")).toBe("taken");
    expect(problem("Wellness")).toBe("taken");
    expect(problem("Memes")).toBe("taken");
  });

  it("refuses a name they already have, whatever the casing or spacing", () => {
    expect(problem("Wedding")).toBe("taken");
    expect(problem("  wedding ")).toBe("taken");
  });

  it("says something useful for each problem", () => {
    for (const p of ["empty", "too-long", "reserved", "taken"] as const) {
      expect(nameProblemMessage(p).length).toBeGreaterThan(0);
    }
  });
});

describe("a category's chosen icon", () => {
  it("offers only glyphs that exist in the font we ship", () => {
    expect(CATEGORY_ICONS.length).toBeGreaterThan(11);
    for (const icon of CATEGORY_ICONS) expect(font[icon], icon).toBeTypeOf("number");
  });

  it("falls back rather than rendering nothing when the stored value is not one we offer", () => {
    expect(categoryIcon("heart-outline")).toBe("heart-outline");
    expect(categoryIcon("not-a-glyph")).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIcon(null)).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIcon(undefined)).toBe(DEFAULT_CATEGORY_ICON);
  });

  it("offers a default that is itself on the list", () => {
    expect(CATEGORY_ICONS).toContain(DEFAULT_CATEGORY_ICON);
  });
});

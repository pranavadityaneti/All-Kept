import { describe, expect, it } from "vitest";
import { categoryStyle } from "../lib/categories";
import { resolveGlyph } from "../lib/icon-names";
import { CATEGORIES } from "@allkept/contracts";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";

const font = glyphs as Record<string, number>;

describe("a category's mark", () => {
  it("exists in the font for every category the classifier can return", () => {
    for (const c of CATEGORIES) expect(font[categoryStyle(c).icon], c).toBeTypeOf("number");
  });

  it("exists for the three labels the database invents for a save with no category", () => {
    for (const c of ["Sorting", "Uncategorized", "Needs attention"]) {
      expect(font[categoryStyle(c).icon], c).toBeTypeOf("number");
    }
  });

  it("falls back to a real mark for a category a person invented", () => {
    expect(font[categoryStyle("Wedding").icon]).toBeTypeOf("number");
  });
});

describe("resolveGlyph", () => {
  it("lets a semantic key win over a glyph of the same spelling", () => {
    expect(resolveGlyph("home")).toBe("home-outline");
  });

  it("passes a glyph named directly straight through", () => {
    expect(resolveGlyph("barbell-outline")).toBe("barbell-outline");
  });
});

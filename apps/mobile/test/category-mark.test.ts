import { describe, expect, it } from "vitest";
import { resolveGlyph } from "../lib/icon-names";

describe("resolveGlyph", () => {
  it("lets a semantic key win over a glyph of the same spelling", () => {
    expect(resolveGlyph("home")).toBe("home-outline");
  });

  it("passes a glyph named directly straight through", () => {
    expect(resolveGlyph("barbell-outline")).toBe("barbell-outline");
  });
});

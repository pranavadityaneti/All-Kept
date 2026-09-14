import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock("react-native", () => ({ useColorScheme: () => "light" }));
import { FONT, MANROPE, font, type } from "../lib/theme";

describe("the typeface", () => {
  it("is Manrope, with a file for every weight the scale uses and no weight left to synthesise", () => {
    expect(FONT).toBe("Manrope");
    for (const w of ["400", "500", "600", "700"] as const) {
      const style = font(w);
      expect(style.fontFamily, w).toBe(MANROPE[w]);
      // A static face carries its own weight; asking for one on top makes iOS hunt for a bolder
      // cut that is not there and fall back to the system font.
      expect(style.fontWeight).toBeUndefined();
    }
  });

  it("puts the family on every step of the scale", () => {
    for (const [name, style] of Object.entries(type)) {
      expect((style as { fontFamily?: string }).fontFamily, name).toMatch(/^Manrope_/);
      expect((style as { fontWeight?: string }).fontWeight, name).toBeUndefined();
    }
  });

  it("names a file for each weight Manrope ships", () => {
    expect(Object.keys(MANROPE).sort()).toEqual(["200", "300", "400", "500", "600", "700", "800"]);
    for (const [w, family] of Object.entries(MANROPE)) expect(family).toBe(`Manrope_${w}${{ "200": "ExtraLight", "300": "Light", "400": "Regular", "500": "Medium", "600": "SemiBold", "700": "Bold", "800": "ExtraBold" }[w]}`);
  });
});

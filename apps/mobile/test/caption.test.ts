import { describe, expect, it } from "vitest";
import { captionBody } from "../lib/caption";

describe("the caption in the sheet", () => {
  it("drops the line the sheet already shows as its title, and keeps the rest", () => {
    expect(captionBody("Lost in this place 🌻💛\n\nMade with [ @supercool_hq ]\n#darkaesthetic", "Lost in this place 🌻💛")).toBe("Made with [ @supercool_hq ]\n#darkaesthetic");
    expect(captionBody("A title of its own\nThe caption", "Something else")).toBe("A title of its own\nThe caption");
  });
  it("is nothing when the title was the whole caption, or there was none", () => {
    expect(captionBody("Lost in this place 🌻💛", "Lost in this place 🌻💛")).toBeNull();
    expect(captionBody("  \n Lost in this place 🌻💛 \n ", "Lost in this place 🌻💛")).toBeNull();
    expect(captionBody(null, "x")).toBeNull();
    expect(captionBody("", "x")).toBeNull();
  });
});

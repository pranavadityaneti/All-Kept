import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@allkept/contracts";
import { checkCategoryName, nameProblemMessage } from "../lib/user-categories";
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

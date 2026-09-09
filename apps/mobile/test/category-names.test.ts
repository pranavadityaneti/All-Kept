import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@allkept/contracts";
import { categoryDisplayName } from "../lib/category-names";

describe("category presentation", () => {
  it("has a compact label for every classifier category", () => {
    expect(CATEGORIES.map(categoryDisplayName)).toEqual([
      "Food", "Wellness", "Travel", "Learn", "Tech", "Career", "Design", "Style",
      "Beauty", "Home", "Entertainment", "Memes", "News", "Life", "Other",
    ]);
  });

  it("keeps legacy category values readable during rollout", () => {
    expect(categoryDisplayName("Fashion & shopping")).toBe("Style");
    expect(categoryDisplayName("Quotes & motivation")).toBe("Life");
    expect(categoryDisplayName("People & personal")).toBe("Life");
  });
});

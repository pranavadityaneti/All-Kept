import { describe, expect, it } from "vitest";
import { expandable } from "../lib/expandable";

const six = [1, 2, 3, 4, 5, 6];

describe("expandable", () => {
  it("offers nothing when everything already fits", () => {
    expect(expandable(six, 6, false)).toEqual({ shown: six });
    expect(expandable([], 6, false)).toEqual({ shown: [] });
  });

  it("shows the first few and offers to open", () => {
    expect(expandable([...six, 7], 6, false)).toEqual({ shown: six, actionLabel: "See all" });
  });

  it("shows everything and offers to close — the case that used to be a one-way door", () => {
    expect(expandable([...six, 7], 6, true)).toEqual({ shown: [...six, 7], actionLabel: "Show less" });
  });

  it("keeps offering to close however many there are, so the control cannot remove itself", () => {
    const many = Array.from({ length: 40 }, (_, i) => i);
    expect(expandable(many, 6, true).actionLabel).toBe("Show less");
  });
});

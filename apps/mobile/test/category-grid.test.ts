import { describe, expect, it } from "vitest";
import { arrangeGrid } from "../lib/category-grid";
import type { Facet } from "../lib/filter-groups";

// All-time counts, as facets arrive: biggest first.
const all: Facet = [
  { value: "Tech & tools", n: 69 }, { value: "Entertainment", n: 29 }, { value: "Money & career", n: 16 },
  { value: "Learning & how-to", n: 13 }, { value: "Other", n: 4 }, { value: "Humour & memes", n: 2 },
  { value: "Fitness & health", n: 2 }, { value: "Design & inspiration", n: 1 }, { value: "News & opinion", n: 1 },
  { value: "Wedding", n: 1, icon: "ring", mine: true },
];

describe("the two wide cards", () => {
  it("are the categories saved to most in the last thirty days, however small they are all-time", () => {
    const recent = [{ category: "Wedding", n: 5 }, { category: "Humour & memes", n: 3 }, { category: "Tech & tools", n: 1 }];
    const { wide } = arrangeGrid(all, recent, false);
    expect(wide.map((c) => c.value)).toEqual(["Wedding", "Humour & memes"]);
  });

  it("fall back to the all-time biggest when fewer than two have anything recent", () => {
    const { wide } = arrangeGrid(all, [{ category: "Wedding", n: 5 }], false);
    expect(wide.map((c) => c.value)).toEqual(["Tech & tools", "Entertainment"]);
  });

  it("never appear again below, and the rest keep their all-time order", () => {
    const recent = [{ category: "Wedding", n: 5 }, { category: "Other", n: 3 }];
    const { wide, rest } = arrangeGrid(all, recent, true);
    expect(wide.map((c) => c.value)).toEqual(["Wedding", "Other"]);
    expect(rest.map((c) => c.value)).toEqual(["Tech & tools", "Entertainment", "Money & career", "Learning & how-to", "Humour & memes", "Fitness & health", "Design & inspiration", "News & opinion"]);
  });

  it("carry the facet through, so a category of your own keeps its mark", () => {
    const { wide } = arrangeGrid(all, [{ category: "Wedding", n: 5 }, { category: "Other", n: 3 }], false);
    expect(wide[0]).toMatchObject({ value: "Wedding", icon: "ring", mine: true });
  });
});

describe("the rows below", () => {
  it("show six collapsed and offer to open, then all and offer to close", () => {
    const recent = [{ category: "Tech & tools", n: 9 }, { category: "Entertainment", n: 4 }];
    const closed = arrangeGrid(all, recent, false);
    expect(closed.rest).toHaveLength(6);
    expect(closed.actionLabel).toBe("See all");
    const open = arrangeGrid(all, recent, true);
    expect(open.rest).toHaveLength(8);
    expect(open.actionLabel).toBe("Show less");
  });

  it("offer nothing when everything already fits", () => {
    const few = all.slice(0, 5);
    const out = arrangeGrid(few, [], false);
    expect(out.wide).toHaveLength(2);
    expect(out.rest).toHaveLength(3);
    expect(out.actionLabel).toBeUndefined();
  });

  it("cope with one category, or none", () => {
    expect(arrangeGrid(all.slice(0, 1), [], false)).toEqual({ wide: [all[0]], rest: [] });
    expect(arrangeGrid([], [], false)).toEqual({ wide: [], rest: [] });
  });
});

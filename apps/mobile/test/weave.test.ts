import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import type { WeavePlan, WeaveProfile } from "@allkept/contracts";
import { crowdLine, planText, shiftMix, splitDays, stopHours, type PlanStop } from "../lib/weave";

const profile: WeaveProfile = { mix: [{ kind: "food", share: 0.5, evidence: [] }, { kind: "cityscape", share: 0.5, evidence: [] }], towns: [{ name: "Seoul", country: "KR", saves: 30, nights: 3 }, { name: "Busan", country: "KR", saves: 5, nights: 1 }], must: [], style: "", group: null, budgetWords: null, unsure: [] };
const stop = (over: Partial<PlanStop> & { id: string }): PlanStop => ({
  source: "save", name: `Place ${over.id}`, kind: "food", town: "Seoul", area: null, address: "1 Road", lat: 0, lng: 0, openByDay: ["open", "open"], rating: null, ratingCount: null, priceLevel: null,
  about: null, tags: [], screen: null, note: null, must: false, savedTimes: 1, near: [], title: `Reel ${over.id}`, url: `https://www.instagram.com/reel/${over.id}/`, ...over,
});

describe("editing what the saves say", () => {
  it("moves a kind's share by half and folds the rest back to one", () => {
    const more = shiftMix(profile, "food", "more");
    expect(more.mix.map((m) => m.share)).toEqual([0.6, 0.4]);
    const less = shiftMix(profile, "food", "less");
    expect(less.mix[0]!.share).toBeCloseTo(0.401, 2);
    expect(less.mix.reduce((a, m) => a + m.share, 0)).toBeCloseTo(1, 2);
  });
  it("splits the days among the towns in proportion, whole, at least one each, summing to the days", () => {
    expect(splitDays(7, profile.towns)).toEqual([{ town: "Seoul", nights: 5 }, { town: "Busan", nights: 2 }]);
    expect(splitDays(2, [{ name: "A", nights: 5 }, { name: "B", nights: 1 }, { name: "C", nights: 1 }]).reduce((a, n) => a + n.nights, 0)).toBe(3);
    expect(splitDays(3, [])).toEqual([]);
  });
});

describe("the plan as words", () => {
  it("says what the crowd says, and whether a stop is open that day", () => {
    expect(crowdLine({ rating: 4.55, ratingCount: 2100, priceLevel: "PRICE_LEVEL_MODERATE" })).toBe("4.5 · 2,100 reviews · $$");
    expect(crowdLine({ rating: null, ratingCount: null, priceLevel: null })).toBeNull();
    expect(stopHours(stop({ id: "a", openByDay: ["closed"] }), 0, null, null, new Date())).toBe("Closed that day");
    expect(stopHours(stop({ id: "a", openByDay: ["unknown"] }), 0, null, null, new Date())).toContain("check before you go");
    expect(stopHours(stop({ id: "a" }), 0, null, null, new Date())).toBeNull();
  });
  it("writes the plan a person can send: the days, the stops with their reason, tip, warning and reel; the suggestions said as such; what to book", () => {
    const plan: WeavePlan = {
      overview: "Two days in Seoul.", assumptions: [],
      days: [{ day: 1, date: "2026-10-06", town: "Seoul", theme: "Seongsu", stops: [{ id: "a", slot: "morning", why: "You saved it twice.", cites: ["a"], tip: "The matcha", warning: null }, { id: "s:p1", slot: "lunch", why: "Near the first.", cites: [], tip: null, warning: "Suggested — not from your saves" }], notes: "Rest in the evening." }],
      bookAhead: [{ id: "a", what: "A table", why: "It fills by noon" }], leftOut: [],
    };
    const text = planText(plan, [stop({ id: "a" }), stop({ id: "s:p1", source: "suggested", name: "A café", url: null })], "Seoul — 2 days");
    expect(text).toBe([
      "Seoul — 2 days", "", "Two days in Seoul.", "",
      "Day 1 · 2026-10-06 · Seoul — Seongsu",
      "1. Morning: Place a", "   1 Road", "   You saved it twice.", "   Tip: The matcha", "   From: https://www.instagram.com/reel/a/",
      "2. Lunch: A café (suggested — not from your saves)", "   1 Road", "   Near the first.", "   Suggested — not from your saves",
      "   Rest in the evening.", "", "Book ahead:", "- Place a: A table — It fills by noon", "", "Made with Allkept from the posts you saved.",
    ].join("\n"));
  });
});

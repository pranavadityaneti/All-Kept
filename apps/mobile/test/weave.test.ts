import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import type { WeavePlan, WeaveProfile } from "@allkept/contracts";
import { supabase } from "../lib/supabase";
import { briefLine, crowdLine, dayHeading, dayRoute, defaultDays, foldPlaces, moveNight, pickSummary, mixWith, planText, splitDays, stopHours, tooManyPlaces, tripStatus, tripTitle, weaveUnderstand, whenProblem, WeaveRefused, type PlanStop, type TripSummary } from "../lib/weave";

const profile: WeaveProfile = { mix: [{ kind: "food", share: 0.5, evidence: [] }, { kind: "cityscape", share: 0.5, evidence: [] }], towns: [{ name: "Seoul", country: "KR", saves: 30, nights: 3 }, { name: "Busan", country: "KR", saves: 5, nights: 1 }], must: [], style: "", group: null, budgetWords: null, unsure: [] };
const stop = (over: Partial<PlanStop> & { id: string }): PlanStop => ({
  source: "save", name: `Place ${over.id}`, kind: "food", town: "Seoul", area: null, address: "1 Road", lat: 0, lng: 0, openByDay: ["open", "open"], rating: null, ratingCount: null, priceLevel: null,
  about: null, tags: [], screen: null, note: null, must: false, savedTimes: 1, near: [], title: `Reel ${over.id}`, url: `https://www.instagram.com/reel/${over.id}/`, ...over,
});

describe("editing what the saves say", () => {
  it("sets each kind to less, as saved or more of the mix as read, and folds the rest back to one", () => {
    expect(mixWith(profile.mix, { food: 1 }).map((m) => m.share)).toEqual([0.6, 0.4]);
    const less = mixWith(profile.mix, { food: -1 });
    expect(less[0]!.share).toBeCloseTo(0.401, 2);
    expect(less.reduce((a, m) => a + m.share, 0)).toBeCloseTo(1, 2);
    expect(mixWith(profile.mix, {}).map((m) => m.share)).toEqual([0.5, 0.5]);
  });
  it("never compounds: the same choices give the same mix however often they are made", () => {
    const once = mixWith(profile.mix, { food: 1 });
    expect(mixWith(profile.mix, { food: 1 })).toEqual(once);
    // Back to "as saved" is exactly the mix as read.
    expect(mixWith(profile.mix, { food: 0 }).map((m) => m.share)).toEqual([0.5, 0.5]);
  });
  it("keeps a sliver of a kind turned down, so the server still has it", () => {
    const tiny = [{ kind: "food" as const, share: 0.99, evidence: [] }, { kind: "nature" as const, share: 0.01, evidence: [] }];
    expect(mixWith(tiny, { nature: -1 })[1]!.share).toBeGreaterThan(0.01);
  });
  it("splits the days among the towns in proportion, whole, at least one each, summing to the days", () => {
    expect(splitDays(7, profile.towns)).toEqual([{ town: "Seoul", nights: 5 }, { town: "Busan", nights: 2 }]);
    expect(splitDays(2, [{ name: "A", nights: 5 }, { name: "B", nights: 1 }, { name: "C", nights: 1 }]).reduce((a, n) => a + n.nights, 0)).toBe(3);
    expect(splitDays(3, [])).toEqual([]);
  });
});

describe("how long, and the nights in each place", () => {
  it("moves a night from or to the biggest other place, so the nights always add up to the days", () => {
    const n = [{ town: "Seoul", nights: 5 }, { town: "Busan", nights: 2 }];
    expect(moveNight(n, "Busan", 1)).toEqual([{ town: "Seoul", nights: 4 }, { town: "Busan", nights: 3 }]);
    expect(moveNight(n, "Busan", -1)).toEqual([{ town: "Seoul", nights: 6 }, { town: "Busan", nights: 1 }]);
    expect(moveNight([{ town: "A", nights: 3 }, { town: "B", nights: 2 }, { town: "C", nights: 2 }], "C", 1)).toEqual([{ town: "A", nights: 2 }, { town: "B", nights: 2 }, { town: "C", nights: 3 }]);
  });

  it("refuses a move that would leave a place without a night, or that has nowhere to go", () => {
    expect(moveNight([{ town: "Seoul", nights: 6 }, { town: "Busan", nights: 1 }], "Busan", -1)).toBeNull();
    expect(moveNight([{ town: "Seoul", nights: 6 }, { town: "Busan", nights: 1 }], "Seoul", 1)).toBeNull();
    expect(moveNight([{ town: "Seoul", nights: 7 }], "Seoul", 1)).toBeNull();
    expect(moveNight([{ town: "Seoul", nights: 7 }], "Seoul", -1)).toBeNull();
  });

  it("starts a plan at a week, or at a day for every place when there are more, never past the longest", () => {
    expect(defaultDays(2)).toBe(7);
    expect(defaultDays(9)).toBe(9);
    expect(defaultDays(30)).toBe(21);
  });
});

describe("a day's route in Google Maps", () => {
  it("goes the way the trip says it gets around, and says so", () => {
    expect(dayRoute("walk_cab", 4)).toEqual({ mode: "walking", label: "Open the day in Google Maps · walking" });
    expect(dayRoute("car", 4)).toEqual({ mode: "driving", label: "Open the day in Google Maps · by car" });
    expect(dayRoute("transit", 2)).toEqual({ mode: "transit", label: "Open the day in Google Maps · by transit" });
    // Public transport can't be routed through the stops in between, so the label says what the link does.
    expect(dayRoute("transit", 4)).toEqual({ mode: "transit", label: "First stop to last in Google Maps · by transit" });
  });
});

describe("a plan's choices in one line", () => {
  const now = new Date(2026, 9, 2);
  it("says the pace, how they get around, and the dates when there are any", () => {
    expect(briefLine({ days: 7, startDate: "2026-10-06", pace: "relaxed", transport: "walk_cab" }, now)).toBe("Relaxed · walking and cabs · Tue 6 – Mon 12 Oct");
    expect(briefLine({ days: 12, startDate: null, pace: "full", transport: "transit" }, now)).toBe("Full days · by transit");
    expect(briefLine({ days: 3, startDate: null, pace: "relaxed", transport: "car" }, now)).toBe("Relaxed · by car");
  });
});

describe("picking the places for a trip", () => {
  const towns = [
    { name: "Seoul", saves: 15, placed: 9 }, { name: "Tokyo", saves: 12, placed: 8 }, { name: "Busan", saves: 7, placed: 4 },
    { name: "Osaka", saves: 6, placed: 4 }, { name: "Kyoto", saves: 3, placed: 2 }, { name: "Weligama", saves: 2, placed: 1 },
    { name: "Daejeon", saves: 1, placed: 1 }, { name: "Jaipur", saves: 1, placed: 0 }, { name: "Claremont", saves: 1, placed: 1 },
  ];

  it("keeps places with one save under More places once there are enough of the rest", () => {
    const { main, more } = foldPlaces(towns);
    expect(main.map((t) => t.name)).toEqual(["Seoul", "Tokyo", "Busan", "Osaka", "Kyoto", "Weligama"]);
    expect(more.map((t) => t.name)).toEqual(["Daejeon", "Jaipur", "Claremont"]);
  });

  it("folds nothing when there are few places, or when nearly all of them have one save", () => {
    expect(foldPlaces(towns.slice(0, 4)).more).toEqual([]);
    const small = [{ name: "A", saves: 3, placed: 1 }, { name: "B", saves: 1, placed: 1 }, { name: "C", saves: 1, placed: 1 }, { name: "D", saves: 1, placed: 1 }, { name: "E", saves: 1, placed: 1 }, { name: "F", saves: 1, placed: 1 }, { name: "G", saves: 1, placed: 1 }];
    expect(foldPlaces(small).more).toEqual([]);
  });

  it("sums what was picked into the line above the button", () => {
    expect(pickSummary(towns, new Set())).toEqual({ saves: 0, line: "Pick at least one place" });
    expect(pickSummary(towns, new Set(["Seoul"]))).toEqual({ saves: 15, line: "1 place · 15 saves" });
    expect(pickSummary(towns, new Set(["Seoul", "Busan"]))).toEqual({ saves: 22, line: "2 places · 22 saves" });
    expect(pickSummary(towns, new Set(["Daejeon"]))).toEqual({ saves: 1, line: "1 place · 1 save" });
  });

  it("warns, before anything is read, when the places outnumber the days a plan can give them", () => {
    expect(tooManyPlaces(7)).toBeNull();
    expect(tooManyPlaces(8)).toEqual({ blocking: false, text: "8 places need at least 8 days — every place gets a day or more. Pick fewer, or plan 8 days or longer." });
    expect(tooManyPlaces(22)).toEqual({ blocking: true, text: "22 places is more than the longest plan (21 days) can visit. Pick 21 or fewer." });
  });
});

describe("a trip as Your trips lists it", () => {
  const now = new Date(2026, 9, 2, 15, 0).getTime();
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  const trip = (over: Partial<TripSummary>): TripSummary => ({ id: "t1", status: "profiled", towns: ["Seoul"], days: null, message: null, createdAt: ago(60), updatedAt: ago(5), pictureId: null, ...over });

  it("is named by its places, the way a person says them", () => {
    expect(tripTitle(["Seoul"])).toBe("Seoul");
    expect(tripTitle(["Seoul", "Busan"])).toBe("Seoul & Busan");
    expect(tripTitle(["Seoul", "Tokyo", "Kyoto"])).toBe("Seoul, Tokyo & Kyoto");
    expect(tripTitle(["Seoul", "Tokyo", "Busan", "Osaka", "Kyoto"])).toBe("Seoul, Tokyo & 3 more");
    expect(tripTitle(null)).toBe("Everywhere you've saved");
  });

  it("says where it is in words, never colour alone", () => {
    expect(tripStatus(trip({ status: "reading", createdAt: ago(42) }), now)).toEqual({ tone: "accent", text: "Reading your saves · 0:42" });
    expect(tripStatus(trip({ status: "profiled" }), now)).toEqual({ tone: "accent", text: "Ready to plan" });
    expect(tripStatus(trip({ status: "planning", days: 7 }), now)).toEqual({ tone: "accent", text: "Weaving your plan…" });
    expect(tripStatus(trip({ status: "planned", days: 7, updatedAt: new Date(2026, 9, 2, 9, 41).toISOString() }), now)).toEqual({ tone: "good", text: "Ready · made today, 9:41 am" });
    expect(tripStatus(trip({ status: "planned", days: 7, updatedAt: new Date(2026, 8, 28, 9, 32).toISOString() }), now)).toEqual({ tone: "good", text: "Ready · made Mon 28 Sep" });
    expect(tripStatus(trip({ status: "failed" }), now)).toEqual({ tone: "bad", text: "Couldn't finish — tap to try again" });
  });

  it("a job gone silent past the heartbeat reads as stopped, not running", () => {
    expect(tripStatus(trip({ status: "reading", updatedAt: ago(5 * 60) }), now)).toEqual({ tone: "bad", text: "Couldn't finish — tap to try again" });
    expect(tripStatus(trip({ status: "planning", days: 7, updatedAt: ago(5 * 60) }), now)).toEqual({ tone: "bad", text: "Couldn't finish — tap to try again" });
  });
});

describe("when no answer comes back", () => {
  it("says Allkept couldn't be reached just now, without blaming the person's connection", async () => {
    // A request that got no response at all (the phone dropped a reused connection, or the network did): no status, no words from the server.
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: new Error("fetch failed: The network connection was lost.") } as never);
    const refused = await weaveUnderstand(["Seoul"]).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(WeaveRefused);
    expect((refused as WeaveRefused).code).toBe("unreachable");
    expect((refused as WeaveRefused).message).toBe("Couldn't reach Allkept just now. Try again in a moment.");
  });
});

describe("dates the plan can use", () => {
  const today = new Date(2026, 9, 2, 15, 0);
  const brief = (over: Partial<{ days: number; startDate: string | null; arrival: string | null; departure: string | null }>) =>
    ({ days: 3, startDate: null, arrival: null, departure: null, ...over });

  it("takes nothing at all, or any day from today on", () => {
    expect(whenProblem(brief({}), today)).toBeNull();
    expect(whenProblem(brief({ startDate: "2026-10-02" }), today)).toBeNull();
    expect(whenProblem(brief({ startDate: "2027-03-01", arrival: "06:00", departure: "23:00" }), today)).toBeNull();
  });

  it("says so when the start has passed, rather than planning around it", () => {
    expect(whenProblem(brief({ startDate: "2026-10-01" }), today)).toBe("That start date has passed. Pick today or a day after.");
  });

  it("says so when a one-day trip leaves before it arrives", () => {
    expect(whenProblem(brief({ days: 1, arrival: "14:00", departure: "13:00" }), today)).toBe("On a one-day trip, leaving has to be after arriving.");
    expect(whenProblem(brief({ days: 1, arrival: "14:00", departure: "14:00" }), today)).toBe("On a one-day trip, leaving has to be after arriving.");
    expect(whenProblem(brief({ days: 1, arrival: "09:00", departure: "18:00" }), today)).toBeNull();
    // Arriving on the first day and leaving on another can be any two times.
    expect(whenProblem(brief({ days: 2, arrival: "14:00", departure: "09:00" }), today)).toBeNull();
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
  it("heads a day with its number, its date as people say it, and its town", () => {
    const now = new Date(2026, 9, 2);
    expect(dayHeading({ day: 1, date: "2026-10-06", town: "Seoul" }, now)).toBe("Day 1 · Tue 6 Oct · Seoul");
    expect(dayHeading({ day: 3, date: null, town: "Busan" }, now)).toBe("Day 3 · Busan");
  });
  it("writes the plan a person can send: the days, the stops with their reason, tip, warning and reel; the suggestions said as such; what to book", () => {
    const plan: WeavePlan = {
      overview: "Two days in Seoul.", assumptions: [],
      days: [{ day: 1, date: "2026-10-06", town: "Seoul", theme: "Seongsu", stops: [{ id: "a", slot: "morning", why: "You saved it twice.", cites: ["a"], tip: "The matcha", warning: null }, { id: "s:p1", slot: "lunch", why: "Near the first.", cites: [], tip: null, warning: "Suggested — not from your saves" }], notes: "Rest in the evening." }],
      bookAhead: [{ id: "a", what: "A table", why: "It fills by noon" }], leftOut: [],
    };
    const text = planText(plan, [stop({ id: "a" }), stop({ id: "s:p1", source: "suggested", name: "A café", url: null })], "Seoul — 2 days", new Date(2026, 9, 2));
    expect(text).toBe([
      "Seoul — 2 days", "", "Two days in Seoul.", "",
      "Day 1 · Tue 6 Oct · Seoul — Seongsu",
      "1. Morning: Place a", "   1 Road", "   You saved it twice.", "   Tip: The matcha", "   From: https://www.instagram.com/reel/a/",
      "2. Lunch: A café (suggested — not from your saves)", "   1 Road", "   Near the first.", "   Suggested — not from your saves",
      "   Rest in the evening.", "", "Book ahead:", "- Place a: A table — It fills by noon", "", "Made with Allkept from the posts you saved.",
    ].join("\n"));
  });
});

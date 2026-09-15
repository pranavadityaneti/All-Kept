import { assert, assertEquals } from "jsr:@std/assert@1";
import type { WeaveBrief, WeaveProfile } from "../_shared/contracts.ts";
import { PLAN_PROMPT, PLAN_SCHEMA, planMessage, SUGGESTED_LABEL, validatePlan, type Skeleton, type SkeletonStop } from "../_shared/weave/plan.ts";

const stop = (over: Partial<SkeletonStop> & { id: string }): SkeletonStop => ({
  source: "save", name: `Stop ${over.id}`, kind: "food", town: "Seoul", area: "Seongsu", address: null, lat: 37.5, lng: 127.0,
  openByDay: ["open", "open"], rating: 4.5, ratingCount: 200, priceLevel: null, about: null, tags: [], screen: null, note: null, must: false, savedTimes: 1, near: [], ...over,
});
const skeleton: Skeleton = {
  days: [{ day: 1, date: "2026-10-06", town: "Seoul", slots: 2, transit: false, weekday: "Tuesday" }, { day: 2, date: "2026-10-07", town: "Busan", slots: 3, transit: true, weekday: "Wednesday" }],
  stops: [stop({ id: "a", must: true }), stop({ id: "b", openByDay: ["closed", "open"] }), stop({ id: "c", town: "Busan", openByDay: ["unknown", "unknown"] }), stop({ id: "s:p1", source: "suggested", town: "Busan", name: "A suggested café" })],
  bases: [], holidays: [], weather: [],
};
const good = {
  overview: "Two days.", assumptions: ["You land in the morning."],
  days: [
    { day: 1, date: "2026-10-06", town: "Seoul", theme: "Seongsu", stops: [{ id: "a", slot: "morning", why: "You saved it twice", cites: ["a", "zz"], tip: null, warning: null }], notes: null },
    { day: 2, date: "2026-10-07", town: "Busan", theme: "The coast", stops: [{ id: "c", slot: "lunch", why: "The reel's fish market", cites: ["c"], tip: "Try the eomuk", warning: null }, { id: "s:p1", slot: "afternoon", why: "A coffee near the beach", cites: [], tip: null, warning: "Popular" }], notes: null },
  ],
  bookAhead: [{ id: "c", what: "A table", why: "Busy at lunch" }, { id: "nope", what: "", why: "" }],
  leftOut: [{ id: "b", reason: "Closed on the first day" }],
};

Deno.test("a plan that holds together passes, made safe: a suggestion is labelled whatever was written, unknown hours say check before you go, cites keep only saves given", () => {
  const out = validatePlan(good, skeleton, ["a"])!;
  assertEquals(out.problems, []);
  assertEquals(out.plan.days[0]!.stops[0]!.cites, ["a"]);
  assertEquals(out.plan.days[1]!.stops[1]!.warning, `${SUGGESTED_LABEL}. Popular`);
  assert(out.plan.days[1]!.stops[0]!.warning!.includes("check before you go"));
  assertEquals(out.plan.bookAhead, [{ id: "c", what: "A table", why: "Busy at lunch" }]);
  assertEquals(out.plan.leftOut, [{ id: "b", reason: "Closed on the first day" }]);
});

Deno.test("what does not hold together is named: a stop not given, one placed twice, one on a closed day, a day over its room, a must neither placed nor explained, a day in the wrong town", () => {
  const bad = {
    ...good,
    days: [
      { ...good.days[0], town: "Busan", stops: [{ id: "b", slot: "morning", why: "", cites: [], tip: null, warning: null }, { id: "x", slot: "lunch", why: "", cites: [], tip: null, warning: null }, { id: "c", slot: "afternoon", why: "", cites: [], tip: null, warning: null }] },
      { ...good.days[1], stops: [{ id: "c", slot: "lunch", why: "", cites: [], tip: null, warning: null }] },
    ],
    leftOut: [],
  };
  const out = validatePlan(bad, skeleton, ["a"])!;
  const text = out.problems.join("\n");
  for (const need of ["day 1 is in Seoul, not Busan", "Stop b (b) is closed that day", '"x" is not one of the stops given', "Stop c (c) is placed twice", "Stop a (a) is a must-do"]) assert(text.includes(need), need);
  // Day 1 had room for two; three were placed, one of them unknown — counted after the unknown is dropped.
  assert(text.includes("day 1 has room for 2 stops; you placed 2") === false);
  // Anything chosen and neither placed nor explained is listed as not fitting, so nothing vanishes.
  assert(out.plan.leftOut.some((l) => l.id === "s:p1" && l.reason === "did not fit the days"));
});

Deno.test("the number of days must match the trip, and nothing at all is not a plan", () => {
  const out = validatePlan({ ...good, days: [good.days[0]] }, skeleton, [])!;
  assert(out.problems.some((p) => p.includes("the trip has 2 days; you gave 1")));
  assertEquals(validatePlan(null, skeleton, []), null);
});

Deno.test("the schema names every field the validator reads, strictly; the prompt carries the rules; the message carries the brief, the profile, the skeleton and, on a retry, the problems", () => {
  const out = validatePlan(good, skeleton, [])!.plan;
  assertEquals(Object.keys(PLAN_SCHEMA.properties).sort(), Object.keys(out).sort());
  assertEquals([...PLAN_SCHEMA.required].sort(), Object.keys(out).sort());
  const stopKeys = Object.keys(PLAN_SCHEMA.properties.days.items.properties.stops.items.properties).sort();
  assertEquals(stopKeys, Object.keys(out.days[0]!.stops[0]!).sort());
  for (const rule of ["use only the stops given", "Suggested — not from your saves", "check before you go", "never claim a booking", "one area a day", "one big activity a day", "light first day", "nothing on a day a place is closed", "check this year's dates", "bookAhead", "leftOut"]) assert(PLAN_PROMPT.includes(rule), rule);
  const brief = { days: 2 } as WeaveBrief, profile = { style: "x" } as WeaveProfile;
  const msg = planMessage(brief, profile, skeleton, "en", ["day 1 has too many stops"]);
  assert(msg.startsWith("write in: en"));
  for (const part of ["brief:", "what the saves say:", "skeleton:", "Fix these and answer again", "day 1 has too many stops"]) assert(msg.includes(part), part);
  assert(!planMessage(brief, profile, skeleton, "en").includes("Fix these"));
});

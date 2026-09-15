import { assertEquals } from "jsr:@std/assert@1";
import type { WeaveBrief, WeaveProfile } from "../_shared/contracts.ts";
import { allot, scoreSave, selectStops, slotsPerDay, type WeaveSave } from "../_shared/weave/select.ts";

const save = (over: Partial<WeaveSave> & { id: string }): WeaveSave => ({
  kind: "food", town: "Seoul", placed: true, saveCount: 1, noted: false, reminded: false, done: false, specific: false, savedAt: "2026-09-01T00:00:00Z", ...over,
});
const brief = (over: Partial<WeaveBrief> = {}): WeaveBrief => ({
  days: 4, startDate: null, nights: [{ town: "Seoul", nights: 3 }, { town: "Busan", nights: 1 }], arrival: null, departure: null, bases: [],
  group: null, pace: "relaxed", transport: "walk_cab", budget: null, must: [], skip: [], note: null, ...over,
});
const profile = (over: Partial<WeaveProfile> = {}): WeaveProfile => ({
  mix: [{ kind: "food", share: 0.5, evidence: [] }, { kind: "coffee", share: 0.25, evidence: [] }, { kind: "cityscape", share: 0.25, evidence: [] }],
  towns: [{ name: "Seoul", saves: 30, nights: 3 }, { name: "Busan", saves: 4, nights: 1 }], must: [], style: "", group: null, budgetWords: null, unsure: [], ...over,
});

Deno.test("a day holds the pace, less one on the first day, the last day, and the day a town changes", () => {
  assertEquals(slotsPerDay({ days: 4, pace: "relaxed", nights: [{ town: "Seoul", nights: 3 }, { town: "Busan", nights: 1 }] }), [3, 4, 4, 2]);
  assertEquals(slotsPerDay({ days: 3, pace: "full", nights: [{ town: "Tokyo", nights: 3 }] }), [5, 6, 5]);
  assertEquals(slotsPerDay({ days: 1, pace: "relaxed", nights: [{ town: "Tokyo", nights: 1 }] }), [2]);
});

Deno.test("shares become whole counts that sum to the total, by largest remainder", () => {
  assertEquals(allot(10, [{ key: "food", share: 0.5 }, { key: "coffee", share: 0.25 }, { key: "cityscape", share: 0.25 }]), { food: 5, coffee: 3, cityscape: 2 });
  assertEquals(allot(7, [{ key: "a", share: 1 }, { key: "b", share: 1 }, { key: "c", share: 1 }]), { a: 3, b: 2, c: 2 });
  assertEquals(allot(0, [{ key: "a", share: 1 }]), { a: 0 });
  assertEquals(allot(3, []), {});
});

Deno.test("a save asks harder for the plan when it was meant twice, noted, reminded, specific and on the map; a visited one steps back", () => {
  const must = new Set(["m"]);
  assertEquals(scoreSave(save({ id: "x" }), must), 1);
  assertEquals(scoreSave(save({ id: "m", saveCount: 2, noted: true, reminded: true, specific: true }), must), 10);
  assertEquals(scoreSave(save({ id: "d", done: true, placed: false }), must), -3);
});

Deno.test("slots go to towns by nights and to kinds by the mix; the strongest saves take them; the rest are kept with a reason; a wanting kind is a gap", () => {
  const saves = [
    ...Array.from({ length: 8 }, (_, i) => save({ id: `f${i}`, saveCount: i === 0 ? 2 : 1 })),
    save({ id: "c1", kind: "coffee" }), save({ id: "c2", kind: "coffee", noted: true }), save({ id: "c3", kind: "coffee" }),
    save({ id: "v1", kind: "cityscape" }),
    save({ id: "b1", town: "Busan", kind: "food" }),
    save({ id: "done", done: true }),
    save({ id: "osaka", town: "Osaka" }),
    save({ id: "nowhere", town: null }),
    save({ id: "ad" }),
  ];
  const sel = selectStops(saves, profile({ unsure: ["ad"] }), brief());
  // 13 slots: Seoul 10 (food 5, coffee 3, cityscape 2), Busan 3 (one each: 1.5 / 0.75 / 0.75 by largest remainder).
  assertEquals(sel.slots.reduce((a, b) => a + b, 0), 13);
  const chosen = sel.chosen.map((s) => s.id);
  assertEquals(chosen.includes("f0"), true, "saved twice, so first among the food");
  assertEquals(chosen.filter((id) => id.startsWith("f")).length, 5);
  assertEquals(chosen.includes("c2") && chosen.filter((id) => id.startsWith("c")).length === 3, true);
  assertEquals(chosen.includes("v1"), true);
  assertEquals(chosen.includes("b1"), true);
  for (const id of ["done", "osaka", "nowhere", "ad"]) assertEquals(chosen.includes(id), false, id);
  const reasons = Object.fromEntries(sel.leftOut.map((l) => [l.id, l.reason]));
  assertEquals(reasons["done"], "already visited");
  assertEquals(reasons["osaka"], "Osaka is not on this trip");
  assertEquals(reasons["nowhere"], "no town found for it");
  assertEquals(reasons["ad"], "looked like an ad or a montage");
  assertEquals(reasons["f7"], "did not fit the days");
  // Seoul wanted 2 cityscapes and has 1; Busan wanted a coffee and a cityscape and has neither.
  assertEquals(sel.gaps, [{ town: "Seoul", kind: "cityscape", want: 1 }, { town: "Busan", kind: "coffee", want: 1 }, { town: "Busan", kind: "cityscape", want: 1 }]);
});

Deno.test("a must is always taken, even beyond its kind's room or outside the mix; a skip never is", () => {
  const saves = [save({ id: "a" }), save({ id: "b" }), save({ id: "night", kind: "nightlife" }), save({ id: "x" })];
  const one = brief({ days: 1, nights: [{ town: "Seoul", nights: 1 }], must: ["b", "night"], skip: ["a"] });
  const sel = selectStops(saves, profile({ mix: [{ kind: "food", share: 1, evidence: [] }] }), one);
  const chosen = sel.chosen.map((s) => s.id);
  assertEquals(chosen.includes("b") && chosen.includes("night"), true);
  assertEquals(chosen.includes("a"), false);
  assertEquals(sel.leftOut.find((l) => l.id === "a")?.reason, "you asked to leave it out");
});

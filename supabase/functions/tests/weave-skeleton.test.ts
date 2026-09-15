import { assertEquals } from "jsr:@std/assert@1";
import type { WeaveBrief } from "../_shared/contracts.ts";
import { areasFor, buildSkeleton, dateAfter, nearestTo, openOnDay, tripDays, type ChosenStop } from "../_shared/weave/skeleton.ts";

const brief = (over: Partial<WeaveBrief> = {}): WeaveBrief => ({
  days: 4, startDate: "2026-10-06", nights: [{ town: "Seoul", nights: 3 }, { town: "Busan", nights: 1 }], arrival: null, departure: null, bases: [],
  group: null, pace: "relaxed", transport: "walk_cab", budget: null, must: [], skip: [], note: null, ...over,
});
const stop = (over: Partial<ChosenStop> & { id: string }): ChosenStop => ({
  source: "save", name: `Stop ${over.id}`, kind: "food", town: "Seoul", about: null, tags: [], screen: null, note: null, must: false, savedTimes: 1,
  place: { lat: 37.544, lng: 127.056, address: null, periods: null, utcOffsetMinutes: 540, rating: null, ratingCount: null, priceLevel: null }, ...over,
});

Deno.test("the days are numbered and dated, in their towns by the nights in order, the first day in a new town marked transit, each with its room and weekday", () => {
  const days = tripDays(brief(), [3, 4, 4, 2]);
  assertEquals(days.map((d) => [d.day, d.date, d.town, d.slots, d.transit, d.weekday]), [
    [1, "2026-10-06", "Seoul", 3, false, "Tuesday"], [2, "2026-10-07", "Seoul", 4, false, "Wednesday"], [3, "2026-10-08", "Seoul", 4, false, "Thursday"], [4, "2026-10-09", "Busan", 2, true, "Friday"],
  ]);
  assertEquals(tripDays(brief({ startDate: null, days: 2, nights: [{ town: "Tokyo", nights: 2 }] }), [3, 3]).map((d) => [d.date, d.weekday, d.town]), [[null, null, "Tokyo"], [null, null, "Tokyo"]]);
  assertEquals(dateAfter("2026-10-30", 3), "2026-11-02");
});

Deno.test("open on a day: any period that day or running into it from the night before; other days only is closed; no hours is unknown; around the clock is open; without a date a place with hours is presumed open", () => {
  const monToFri = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } }));
  assertEquals(openOnDay(monToFri, 1), "open");
  assertEquals(openOnDay(monToFri, 0), "closed");
  assertEquals(openOnDay([{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }], 0), "open");
  assertEquals(openOnDay(null, 1), "unknown");
  assertEquals(openOnDay([], 1), "unknown");
  assertEquals(openOnDay([{ open: { day: 0, hour: 0, minute: 0 } }], 3), "open");
  assertEquals(openOnDay(monToFri, null), "open");
});

Deno.test("stops within a short walk share an area, per town; a stop without a place stands alone; the nearest stops carry their distance", () => {
  const stops = [
    stop({ id: "a" }), stop({ id: "b", place: { ...stop({ id: "b" }).place!, lat: 37.546, lng: 127.058 } }),
    stop({ id: "far", place: { ...stop({ id: "far" }).place!, lat: 37.50, lng: 126.90 } }),
    stop({ id: "busan", town: "Busan", place: { ...stop({ id: "busan" }).place!, lat: 35.15, lng: 129.11 } }),
    stop({ id: "nowhere", place: null }),
  ];
  const areas = areasFor(stops);
  assertEquals([areas.get("a"), areas.get("b"), areas.get("far"), areas.get("busan"), areas.get("nowhere")], ["Seoul · area 1", "Seoul · area 1", "Seoul · area 2", "Busan · area 1", null]);
  const near = nearestTo(stops[0]!, stops);
  assertEquals(near.map((n) => n.id), ["b", "far"]);
  assertEquals(near[0]!.km < 0.5 && near[1]!.km > 10, true);
  assertEquals(nearestTo(stops[4]!, stops), []);
});

Deno.test("the skeleton carries each stop's openness on each day of the trip, its area, its neighbours and its facts", () => {
  const closedFriday = [1, 2, 3, 4].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } }));
  const sk = buildSkeleton([stop({ id: "a", place: { ...stop({ id: "a" }).place!, periods: closedFriday, rating: 4.4, ratingCount: 120 } }), stop({ id: "b", town: "Busan", must: true, screen: "x".repeat(200) })], brief(), [3, 4, 4, 2], { bases: [{ town: "Seoul", name: "A hotel" }], holidays: [{ date: "2026-10-09", name: "Hangul Day", country: "KR" }], weather: ["Seoul: mild"] });
  assertEquals(sk.days.length, 4);
  assertEquals(sk.stops[0]!.openByDay, ["open", "open", "open", "closed"]);
  assertEquals([sk.stops[0]!.rating, sk.stops[0]!.ratingCount, sk.stops[0]!.area], [4.4, 120, "Seoul · area 1"]);
  assertEquals(sk.stops[1]!.openByDay, ["unknown", "unknown", "unknown", "unknown"]);
  assertEquals([sk.stops[1]!.must, sk.stops[1]!.screen!.length], [true, 120]);
  assertEquals([sk.bases[0]!.name, sk.holidays[0]!.name, sk.weather[0]], ["A hotel", "Hangul Day", "Seoul: mild"]);
});

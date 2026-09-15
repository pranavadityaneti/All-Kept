import { assert, assertEquals } from "jsr:@std/assert@1";
import type { WeaveProfile } from "../_shared/contracts.ts";
import type { Skeleton } from "../_shared/weave/plan.ts";
import { handleWeave, kindOf, readBrief, type WeaveDeps, type WeaveRecord, type WeaveSaveRow } from "../weave/handler.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const WEAVE = "22222222-2222-4222-8222-222222222222";
const place = (lat: number, lng: number, over: Partial<NonNullable<WeaveSaveRow["place"]>> = {}): NonNullable<WeaveSaveRow["place"]> =>
  ({ name: "A place", status: "OPERATIONAL", lat, lng, address: "Somewhere", periods: null, utcOffsetMinutes: 540, rating: 4.5, ratingCount: 300, priceLevel: null, ...over });
const row = (over: Partial<WeaveSaveRow> & { id: string }): WeaveSaveRow => ({
  title: `Reel ${over.id}`, url: `https://www.instagram.com/reel/${over.id}/`, category: "Food & recipes", summary: "A café", tags: ["cafe"], names: [], screenText: null, note: null,
  town: "Seoul", saveCount: 1, reminded: false, visited: false, savedAt: "2026-09-01T00:00:00Z", place: place(37.54, 127.05), ...over,
});
const saves: WeaveSaveRow[] = [
  row({ id: "a", saveCount: 2, place: place(37.544, 127.056, { name: "Cafe Onion" }) }), row({ id: "b", place: place(37.546, 127.058, { name: "Daelim" }) }),
  row({ id: "c", category: "Travel & places", tags: ["view"], place: place(37.55, 127.0, { name: "Namsan" }) }),
  row({ id: "d", town: "Busan", place: place(35.15, 129.11, { name: "Gamcheon" }) }), row({ id: "e", town: "Busan", place: null, names: ["Jagalchi"] }),
];
const profile: WeaveProfile = {
  mix: [{ kind: "food", share: 0.5, evidence: ["a", "b", "d"] }, { kind: "cityscape", share: 0.5, evidence: ["c"] }],
  towns: [{ name: "Seoul", country: "KR", saves: 3, nights: 2 }, { name: "Busan", country: "KR", saves: 2, nights: 1 }],
  must: [{ id: "a", reason: "saved twice" }], style: "hidden gems", group: null, budgetWords: null, unsure: [],
};

/** A model that reads the skeleton it is handed and places every stop, in order, within each day's room. */
function fakePlanner(user: string): unknown {
  const skeleton = JSON.parse(user.split("skeleton: ")[1]!.split("\n\n")[0]!) as Skeleton;
  const stops = [...skeleton.stops];
  const days = skeleton.days.map((d) => {
    const mine = stops.filter((s) => s.town === d.town).slice(0, d.slots);
    for (const m of mine) stops.splice(stops.indexOf(m), 1);
    return { day: d.day, date: d.date, town: d.town, theme: `${d.town} day`, stops: mine.map((s) => ({ id: s.id, slot: "morning", why: `From your reel`, cites: [s.id], tip: null, warning: null })), notes: null };
  });
  return { overview: "A trip.", days, bookAhead: [], leftOut: stops.map((s) => ({ id: s.id, reason: "no room" })), assumptions: [] };
}

function deps(over: Partial<WeaveDeps> = {}): WeaveDeps & { created: Record<string, unknown>[]; updates: Record<string, unknown>[]; suggested: string[]; askedPlan: string[] } {
  const created: Record<string, unknown>[] = [], updates: Record<string, unknown>[] = [], suggested: string[] = [], askedPlan: string[] = [];
  const record: WeaveRecord = { id: WEAVE, towns: null, profile, brief: null, skeleton: null, plan: null, status: "profiled", version: 1 };
  return {
    created, updates, suggested, askedPlan,
    userId: async () => USER, entitled: async () => true, language: async () => "en",
    saves: async (_u, towns) => saves.filter((s) => !towns || towns.includes(s.town)),
    understand: async () => ({ output: profile, refused: false, model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200 } }),
    plan: async (_s, user) => { askedPlan.push(user); return { output: fakePlanner(user), refused: false, model: "claude-fable-5-1", usage: { input_tokens: 5000, output_tokens: 2000 } }; },
    models: { understand: "claude-opus-5", plan: "claude-fable-5-1" },
    suggest: async (town, kind) => { suggested.push(`${town}:${kind}`); return { placeId: `p-${town}-${kind}`, name: `A ${kind} in ${town}`, place: place(35.16, 129.12) }; },
    holidays: async () => [{ date: "2026-10-09", name: "Hangul Day", country: "KR" }],
    weather: async (towns) => towns.map((t) => `${t.name}: mild`),
    create: async (_u, r) => { created.push(r); return WEAVE; },
    update: async (_id, patch) => { updates.push(patch); },
    get: async () => record,
    log: () => {},
    ...over,
  };
}
const post = (body: unknown) => new Request("https://x/weave", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

Deno.test("towns: every town the saves name, with counts, most first", async () => {
  const res = await handleWeave(post({ action: "towns" }), deps());
  assertEquals(await res.json(), { towns: [{ name: "Seoul", saves: 3, placed: 3 }, { name: "Busan", saves: 2, placed: 1 }] });
});

Deno.test("understand: the saves in the chosen towns become a profile kept as a new weave, with only the towns the saves name", async () => {
  const d = deps({ understand: async () => ({ output: { ...profile, towns: [...profile.towns, { name: "Osaka", country: "JP", saves: 0, nights: 1 }] }, refused: false, model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200 } }) });
  const res = await handleWeave(post({ action: "understand", towns: ["Seoul", "Busan"] }), d);
  const body = await res.json() as { weaveId: string; profile: WeaveProfile; saves: number };
  assertEquals([res.status, body.weaveId, body.saves], [200, WEAVE, 5]);
  assertEquals(body.profile.towns.map((t) => t.name), ["Seoul", "Busan"]);
  assertEquals(d.created[0]!["status"], "profiled");
  assert((d.created[0]!["cost_usd"] as number) > 0);
});

Deno.test("understand: a model that fails, refuses or answers nonsense is not a profile; a caller without a subscription is told", async () => {
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ understand: async () => ({ output: null, refused: false, model: "m", usage: null, error: "anthropic 529" }) }))).status, 503);
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ understand: async () => ({ output: { mix: [] }, refused: false, model: "m", usage: null }) }))).status, 503);
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ entitled: async () => false }))).status, 402);
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ saves: async () => [] }))).status, 400);
});

Deno.test("plan: the chosen saves, a suggestion for a gap, the season fetched, the skeleton computed, the plan validated and kept", async () => {
  const d = deps();
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 3, startDate: "2026-10-08", nights: [{ town: "Seoul", nights: 2 }, { town: "Busan", nights: 1 }], pace: "relaxed" } }), d);
  const body = await res.json() as { plan: { days: { town: string; stops: { id: string }[] }[]; leftOut: unknown[] }; stops: { id: string; source: string; openByDay: string[] }[]; leftOut: { id: string; reason: string }[]; cost: number };
  assertEquals(res.status, 200, JSON.stringify(body));
  assertEquals(body.plan.days.map((day) => day.town), ["Seoul", "Seoul", "Busan"]);
  // Busan had room for a cityscape it lacked: one labelled suggestion, about a fifth of the stops at most.
  assertEquals(d.suggested, ["Busan:cityscape"]);
  assertEquals(body.stops.filter((s) => s.source === "suggested").length, 1);
  const skeleton = JSON.parse(d.askedPlan[0]!.split("skeleton: ")[1]!.split("\n\n")[0]!) as Skeleton;
  assertEquals(skeleton.holidays[0]!.name, "Hangul Day");
  assertEquals(skeleton.weather.length > 0, true);
  assertEquals(skeleton.days.map((day) => day.weekday), ["Thursday", "Friday", "Saturday"]);
  const last = d.updates[d.updates.length - 1]!;
  assertEquals(last["status"], "planned");
  assert((last["cost_usd"] as number) > 0.1);
  assert(body.stops.some((s) => s.id === "a"), "the must-do is a stop");
});

Deno.test("plan: a plan that does not hold together is sent back once with the problems named, and refused if it still does not", async () => {
  const asked: string[] = [];
  const d = deps({ plan: async (_s, user) => { asked.push(user); return { output: { overview: "", days: [{ day: 1, date: null, town: "Seoul", theme: "", stops: [{ id: "zz", slot: "morning", why: "", cites: [], tip: null, warning: null }], notes: null }], bookAhead: [], leftOut: [], assumptions: [] }, refused: false, model: "claude-fable-5-1", usage: { input_tokens: 10, output_tokens: 10 } }; } });
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), d);
  assertEquals([res.status, asked.length], [422, 2]);
  assert(asked[1]!.includes("Fix these and answer again"));
  assert(asked[1]!.includes("is not one of the stops given"));
  assertEquals(d.updates[d.updates.length - 1]!["status"], "failed");
});

Deno.test("the brief is made whole from the profile: days default to seven, nights proportional and summing to the days, a split that disagrees with the days is scaled", () => {
  const whole = readBrief({}, profile);
  assert(!("error" in whole));
  if (!("error" in whole)) {
    assertEquals(whole.days, 7);
    assertEquals(whole.nights.reduce((a, n) => a + n.nights, 0), 7);
    assertEquals(whole.nights.map((n) => n.town), ["Seoul", "Busan"]);
    assertEquals([whole.pace, whole.transport, whole.group], ["relaxed", "walk_cab", null]);
  }
  const scaled = readBrief({ days: 4, nights: [{ town: "seoul", nights: 5 }, { town: "Busan", nights: 5 }], arrival: "25:00", pace: "full", budget: "mid", must: ["a", "a", ""], note: "x" }, profile);
  if (!("error" in scaled)) {
    assertEquals(scaled.nights, [{ town: "Seoul", nights: 2 }, { town: "Busan", nights: 2 }]);
    assertEquals([scaled.arrival, scaled.pace, scaled.budget, scaled.must, scaled.note], [null, "full", "mid", ["a"], "x"]);
  }
  assert("error" in readBrief({}, { ...profile, towns: [] }));
});

Deno.test("a save's kind: the mix's own evidence first, then the category and the tags", () => {
  assertEquals(kindOf({ id: "c", category: "Food & recipes", tags: [] }, profile), "cityscape");
  assertEquals(kindOf({ id: "x", category: "Food & recipes", tags: ["matcha"] }, profile), "coffee");
  assertEquals(kindOf({ id: "x", category: "Food & recipes", tags: ["ramen"] }, profile), "food");
  assertEquals(kindOf({ id: "x", category: "Travel & places", tags: ["temple"] }, profile), "culture");
  assertEquals(kindOf({ id: "x", category: "Travel & places", tags: ["hiking"] }, profile), "adventure");
  assertEquals(kindOf({ id: "x", category: "Tech & tools", tags: [] }, profile), "other");
});

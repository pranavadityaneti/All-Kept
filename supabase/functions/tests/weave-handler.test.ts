import { assert, assertEquals } from "jsr:@std/assert@1";
import type { WeaveProfile } from "../_shared/contracts.ts";
import type { Skeleton } from "../_shared/weave/plan.ts";
import type { ModelResult } from "../_shared/classify.ts";
import { jobFromCall, type WeaveJob } from "../_shared/weave/model.ts";
import { handleWeave, JOB_MAX_MS, kindOf, readBrief, WORKER_LIFE_MS, WRITE_MARGIN_MS, type JobState, type WeaveDeps, type WeaveRecord, type WeaveSaveRow } from "../weave/handler.ts";

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

type Fakes = WeaveDeps & {
  created: Record<string, unknown>[]; updates: Record<string, unknown>[]; refused: Record<string, unknown>[]; suggested: string[]; askedPlan: string[]; deferred: Promise<void>[];
  resumed: string[]; cancelled: string[]; row: WeaveRecord; settled(): Promise<void>;
};
/**
 * A weave's row the way the database keeps it: each write lands on it, so a later worker reads what
 * an earlier one wrote — and a write that expects the row as it was lands only if it still is. Two
 * workers share a row by passing the same one.
 */
function deps(over: Partial<WeaveDeps> & { start?: Partial<WeaveRecord> } = {}, shared?: WeaveRecord): Fakes {
  const created: Record<string, unknown>[] = [], updates: Record<string, unknown>[] = [], refused: Record<string, unknown>[] = [], suggested: string[] = [], askedPlan: string[] = [], deferred: Promise<void>[] = [];
  const resumed: string[] = [], cancelled: string[] = [];
  const row: WeaveRecord = shared ?? { id: WEAVE, userId: USER, towns: null, profile, brief: null, skeleton: null, plan: null, status: "profiled", version: 1, updatedAt: new Date().toISOString(), job: null, ...over.start };
  const fields: Record<string, keyof WeaveRecord> = { status: "status", brief: "brief", profile: "profile", skeleton: "skeleton", plan: "plan", job: "job" };
  // A moment later than the last write, as the database's clock would be.
  let stamp = Date.now();
  const land = (patch: Record<string, unknown>) => {
    updates.push(patch);
    for (const [k, v] of Object.entries(patch)) if (fields[k]) (row as unknown as Record<string, unknown>)[fields[k]!] = v;
    row.updatedAt = new Date(stamp = Math.max(stamp + 1, Date.now())).toISOString();
  };
  const { start: _start, ...rest } = over;
  const fakes: Fakes = {
    created, updates, refused, suggested, askedPlan, deferred, resumed, cancelled, row, settled: async () => { while (deferred.length) await deferred.shift(); },
    defer: (work) => { deferred.push(work); }, now: () => Date.now(), bornAt: Date.now(), sleep: async () => {},
    userId: async () => USER, internal: () => false, entitled: async () => true, language: async () => "en",
    saves: async (_u, towns) => saves.filter((s) => !towns || towns.includes(s.town)),
    understand: jobFromCall(async () => ({ output: profile, refused: false, model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200 } })),
    plan: jobFromCall(async (_s, user) => { askedPlan.push(user); return { output: fakePlanner(user), refused: false, model: "claude-fable-5-1", usage: { input_tokens: 5000, output_tokens: 2000 } }; }),
    models: { understand: "claude-opus-5", plan: "claude-fable-5-1" },
    suggest: async (town, kind) => { suggested.push(`${town}:${kind}`); return { placeId: `p-${town}-${kind}`, name: `A ${kind} in ${town}`, place: place(35.16, 129.12) }; },
    holidays: async () => [{ date: "2026-10-09", name: "Hangul Day", country: "KR" }],
    weather: async (towns) => towns.map((t) => `${t.name}: mild`),
    create: async (_u, r) => { created.push(r); return WEAVE; },
    update: async (_id, patch) => { land(patch); },
    settle: async (_id, patch, expect) => {
      const holds = (expect.jobId === null ? row.job === null : row.job?.id === expect.jobId) && (expect.updatedAt === undefined || row.updatedAt === expect.updatedAt);
      if (holds) land(patch); else refused.push(patch);
      return holds;
    },
    get: async () => ({ ...row }),
    load: async () => ({ ...row }),
    orphans: async () => [],
    resume: async (id) => { resumed.push(id); },
    log: () => {},
    ...rest,
  };
  return fakes;
}
/** A model that works as a background job: started, then "still working" for `pending` looks, then the answer. */
function backgroundJob(answer: (user: string) => ModelResult, pending: number, cancelled: string[] = []): WeaveJob & { asked: string[]; looks: number } {
  let n = 0;
  const asked: string[] = [];
  const self = {
    asked, looks: 0,
    start: async (_s: string, user: string) => { asked.push(user); return { id: `job-${asked.length}` }; },
    check: async () => { self.looks++; return n++ < pending ? null : answer(asked[asked.length - 1]!); },
    cancel: async (id: string) => { cancelled.push(id); },
  };
  return self;
}
const planned = (user: string): ModelResult => ({ output: fakePlanner(user), refused: false, model: "gpt-6-astra", usage: { input_tokens: 5000, output_tokens: 9000 } });
const post = (body: unknown) => new Request("https://x/weave", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
/** What was written, without the heartbeats. */
const writes = (d: Fakes) => d.updates.filter((u) => Object.keys(u).length > 0);
const TWO_TOWNS = { days: 3, nights: [{ town: "Seoul", nights: 2 }, { town: "Busan", nights: 1 }] };

Deno.test("towns: every town the saves name, with counts, most first", async () => {
  const res = await handleWeave(post({ action: "towns" }), deps());
  assertEquals(await res.json(), { towns: [{ name: "Seoul", saves: 3, placed: 3 }, { name: "Busan", saves: 2, placed: 1 }] });
});

Deno.test("understand: the saves in the chosen towns become a profile kept as a new weave, with only the towns the saves name", async () => {
  const d = deps({ understand: jobFromCall(async () => ({ output: { ...profile, towns: [...profile.towns, { name: "Osaka", country: "JP", saves: 0, nights: 1 }] }, refused: false, model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200 } })) });
  const res = await handleWeave(post({ action: "understand", towns: ["Seoul", "Busan"] }), d);
  const body = await res.json() as { weaveId: string; status: string };
  // Answered at once: the row exists as "reading" and the reading goes on after the answer.
  assertEquals([res.status, body.weaveId, body.status], [202, WEAVE, "reading"]);
  assertEquals(d.created[0]!["status"], "reading");
  await d.settled();
  const done = d.updates[d.updates.length - 1]!;
  const result = done["result"] as { profile: WeaveProfile; saves: number };
  assertEquals([done["status"], result.saves], ["profiled", 5]);
  assertEquals(result.profile.towns.map((t) => t.name), ["Seoul", "Busan"]);
  assert((done["cost_usd"] as number) > 0);
});

Deno.test("understand: when the reading fails after the answer, the row says so in the person's words and in ours; a crash is a failure too, never a row left reading", async () => {
  const failed = deps({ understand: jobFromCall(async () => ({ output: null, refused: false, model: "m", usage: null, error: "incomplete: max_output_tokens" })) });
  assertEquals((await handleWeave(post({ action: "understand" }), failed)).status, 202);
  await failed.settled();
  assertEquals([writes(failed)[0]!["status"], writes(failed)[0]!["error"], writes(failed)[0]!["message"]], ["failed", "incomplete: max_output_tokens", "Couldn't read your saves just now. Try again in a moment."]);
  const nonsense = deps({ understand: jobFromCall(async () => ({ output: { mix: [] }, refused: false, model: "m", usage: null })) });
  await handleWeave(post({ action: "understand" }), nonsense); await nonsense.settled();
  assertEquals([writes(nonsense)[0]!["status"], writes(nonsense)[0]!["message"]], ["failed", "Couldn't make sense of your saves. Try again in a moment."]);
  const crashed = deps({ understand: jobFromCall(async () => { throw new Error("boom"); }) });
  await handleWeave(post({ action: "understand" }), crashed); await crashed.settled();
  assertEquals([writes(crashed)[0]!["status"], writes(crashed)[0]!["message"]], ["failed", "The itinerary could not be made. Try again in a moment."]);
  assert(String(writes(crashed)[0]!["error"]).includes("boom"));
});

Deno.test("understand: a caller without a subscription is told at the door, and so is one whose saves name no place", async () => {
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ entitled: async () => false }))).status, 402);
  assertEquals((await handleWeave(post({ action: "understand" }), deps({ saves: async () => [] }))).status, 400);
});

Deno.test("plan: the chosen saves, a suggestion for a gap, the season fetched, the skeleton computed, the plan validated and kept", async () => {
  const d = deps();
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 3, startDate: "2026-10-08", nights: [{ town: "Seoul", nights: 2 }, { town: "Busan", nights: 1 }], pace: "relaxed" } }), d);
  assertEquals([res.status, (await res.json() as { status: string }).status], [202, "planning"]);
  assertEquals([d.updates[0]!["status"], d.askedPlan.length], ["planning", 0]);
  await d.settled();
  const body = d.updates[d.updates.length - 1]!["result"] as { plan: { days: { town: string; stops: { id: string }[] }[]; leftOut: unknown[] }; stops: { id: string; source: string; openByDay: string[] }[]; leftOut: { id: string; reason: string }[]; cost: number };
  assertEquals(body.plan.days.map((day) => day.town), ["Seoul", "Seoul", "Busan"]);
  // Seoul had room for more food than was saved, Busan for a cityscape it lacked: one labelled suggestion — about a fifth of the stops at most — for the first gap.
  assertEquals(d.suggested, ["Seoul:food"]);
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
  const d = deps({ plan: jobFromCall(async (_s, user) => { asked.push(user); return { output: { overview: "", days: [{ day: 1, date: null, town: "Seoul", theme: "", stops: [{ id: "zz", slot: "morning", why: "", cites: [], tip: null, warning: null }], notes: null }], bookAhead: [], leftOut: [], assumptions: [] }, refused: false, model: "claude-fable-5-1", usage: { input_tokens: 10, output_tokens: 10 } }; }) });
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), d);
  assertEquals(res.status, 202);
  await d.settled();
  assertEquals(asked.length, 2);
  assert(asked[1]!.includes("Fix these and answer again"));
  assert(asked[1]!.includes("is not one of the stops given"));
  const last = d.updates[d.updates.length - 1]!;
  assertEquals([last["status"], last["message"]], ["failed", "Couldn't make a plan that holds together. Try fewer days, a wider pace, or fewer towns."]);
});

Deno.test("plan: a weave still being woven — its row touched within the heartbeat's patience — is not woven twice; one the worker abandoned is", async () => {
  const fresh = deps({ start: { status: "planning", updatedAt: new Date(Date.now() - 30_000).toISOString() } });
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2 } }), fresh);
  assertEquals([res.status, (await res.json() as { error: string }).error], [409, "Still weaving the last plan. Give it a minute."]);
  const cancelled: string[] = [];
  const abandoned = deps({ start: { status: "planning", updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(), job: { stage: "plan", id: "old-job", attempt: 0, startedAt: 0, usage: [], cost: 0 } }, plan: { ...jobFromCall(async (_s, user) => planned(user)), cancel: async (id) => { cancelled.push(id); } } });
  assertEquals((await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2 } }), abandoned)).status, 202);
  // The job the dead worker left is stopped, not left to be paid for unread.
  assertEquals(cancelled, ["old-job"]);
});

Deno.test("a running job touches its row on the heartbeat, so a worker that dies mid-way is told from one still at work", async () => {
  const d = deps({ heartbeatMs: 10, understand: jobFromCall(async () => { await new Promise((r) => setTimeout(r, 45)); return { output: profile, refused: false, model: "m", usage: { input_tokens: 1, output_tokens: 1 } }; }) });
  await handleWeave(post({ action: "understand" }), d);
  await d.settled();
  const beats = d.updates.filter((u) => Object.keys(u).length === 0).length;
  assert(beats >= 2, `expected heartbeats while reading, got ${beats}`);
  assertEquals(d.updates[d.updates.length - 1]!["status"], "profiled");
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

Deno.test("plan: the model works as a background job — started, looked at until it answers, then the plan kept and the job cleared", async () => {
  const job = backgroundJob(planned, 2);
  const d = deps({ plan: job });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), d);
  await d.settled();
  assertEquals([job.asked.length, job.looks], [1, 3]);
  // The job was kept on the row while it ran, with what finishing needs.
  const kept = d.updates.find((u) => (u["job"] as JobState | null)?.id === "job-1")!["job"] as JobState;
  assertEquals([kept.stage, kept.attempt, kept.plan!.mustIds], ["plan", 0, ["a"]]);
  assertEquals([d.row.status, d.row.job], ["planned", null]);
});

Deno.test("a worker nearly out of time hands its job to a fresh worker, which finishes it", async () => {
  let t = 1_000_000;
  const job = backgroundJob(planned, 4);
  const first = deps({ plan: job, now: () => t, bornAt: t, sleep: async () => { t += 120_000; } });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), first);
  await first.settled();
  // Looked four times; then, with under 45 s of its 400 left, it handed the job on — still planning.
  assertEquals([job.looks, first.resumed, first.row.status, first.row.job?.id], [4, [WEAVE], "planning", "job-1"]);
  // The fresh worker: the server's own ask, carrying the secret.
  t += 10_000;
  const second = deps({ plan: job, now: () => t, bornAt: t, internal: () => true, start: { ...first.row } });
  const res = await handleWeave(post({ action: "resume", weaveId: WEAVE }), second);
  assertEquals(res.status, 202);
  await second.settled();
  assertEquals([second.row.status, second.row.job, job.asked.length], ["planned", null, 1]);
});

Deno.test("a worker's life is counted from when it began, not from the request: one that has answered others for a while hands on sooner", async () => {
  let t = 5_000_000;
  const job = backgroundJob(planned, 99);
  // Began 380 s ago: 20 s left when this plan is asked of it.
  const warm = deps({ plan: job, now: () => t, bornAt: t - 380_000, sleep: async () => { t += 5_000; } });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), warm);
  await warm.settled();
  assertEquals([job.looks, warm.resumed], [1, [WEAVE]]);
});

Deno.test("resume is the server's own: refused without the secret; a worker near its end takes nothing; with no weave named, every job no worker is looking at is handed on", async () => {
  assertEquals((await handleWeave(post({ action: "resume", weaveId: WEAVE }), deps())).status, 403);
  assertEquals((await handleWeave(post({ action: "resume" }), deps())).status, 403);
  const ending = deps({ internal: () => true, bornAt: Date.now() - (WORKER_LIFE_MS - 60_000) });
  assertEquals((await handleWeave(post({ action: "resume", weaveId: WEAVE }), ending)).status, 503);
  // A worker that ran out of time and whose hand-on failed: its row is left planning, with the job on it.
  let t = 0;
  const job = backgroundJob(planned, 4);
  const died = deps({ plan: job, now: () => t, bornAt: 0, sleep: async () => { t += 120_000; }, resume: async () => { throw new Error("resume answered 503"); } });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), died);
  await died.settled();
  assertEquals([died.row.status, died.row.job?.id], ["planning", "job-1"]);
  // The minute's check names no weave: the orphans are found and each handed on.
  const check = deps({ plan: job, now: () => t, bornAt: t, internal: () => true, orphans: async () => [WEAVE], start: { ...died.row } });
  const res = await handleWeave(post({ action: "resume" }), check);
  assertEquals([res.status, (await res.json() as { resumed: number }).resumed], [202, 1]);
  await check.settled();
  assertEquals([check.row.status, check.row.job], ["planned", null]);
});

Deno.test("a job that never answers is stopped after JOB_MAX_MS and the person told, not left planning", async () => {
  let t = 0;
  const cancelled: string[] = [];
  const job = backgroundJob(planned, 10_000, cancelled);
  const d = deps({ plan: job, now: () => t, bornAt: 0, sleep: async () => { t += 60_000; }, resume: async () => {} });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), d);
  await d.settled();
  // Each worker hands on near its end; across workers the job's own clock runs out.
  for (let i = 0; i < 10 && d.row.status === "planning"; i++) {
    const w = deps({ plan: job, now: () => t, bornAt: t, sleep: async () => { t += 60_000; }, internal: () => true, resume: async () => {} }, d.row);
    await handleWeave(post({ action: "resume", weaveId: WEAVE }), w);
    await w.settled();
  }
  assert(t > JOB_MAX_MS, "the job's clock ran past its limit");
  assertEquals([d.row.status, d.row.job, cancelled], ["failed", null, ["job-1"]]);
});

Deno.test("a look that fails — the database a moment away — is looked at again, not taken for a failure", async () => {
  const job = backgroundJob(planned, 1);
  const d = deps({ plan: job });
  const load = d.load;
  let looks = 0;
  d.load = async (id) => { if (looks++ === 1) throw new Error("connection reset"); return load(id); };
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), d);
  await d.settled();
  assertEquals([d.row.status, job.looks], ["planned", 2]);
});

Deno.test("two workers on one job: the first to write wins and the other stops — one retry, not two", async () => {
  // A plan already asked, whose answer does not hold together: each worker would send it back.
  const bad = (): ModelResult => ({ output: { overview: "", days: [{ day: 1, date: null, town: "Seoul", theme: "", stops: [{ id: "zz", slot: "morning", why: "", cites: [], tip: null, warning: null }], notes: null }], bookAhead: [], leftOut: [], assumptions: [] }, refused: false, model: "m", usage: null });
  const cancelled: string[] = [];
  const job = backgroundJob(bad, 0, cancelled);
  const first = deps({ plan: job, sleep: async () => {} });
  first.plan = { ...job, check: async () => null };
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), { ...first, bornAt: Date.now() - WORKER_LIFE_MS });
  await first.settled();
  assertEquals(first.row.job?.id, "job-1");
  // A hand-on and the minute's check crossing: two workers take up the same row at once.
  const a = deps({ plan: job, internal: () => true }, first.row);
  const b = deps({ plan: job, internal: () => true }, first.row);
  await Promise.all([handleWeave(post({ action: "resume", weaveId: WEAVE }), a), handleWeave(post({ action: "resume", weaveId: WEAVE }), b)]);
  await Promise.all([a.settled(), b.settled()]);
  // One retry kept; any other asked in the crossing was stopped at once.
  const retries = job.asked.length - 1;
  assertEquals(retries - cancelled.length, 1);
  assertEquals([first.row.status, first.row.job], ["failed", null]);
});

Deno.test("an answer that arrives after the person asked again is not kept, and a crash then fails nothing of theirs", async () => {
  const row: WeaveRecord = { id: WEAVE, userId: USER, towns: null, profile, brief: null, skeleton: null, plan: null, status: "reading", version: 1, updatedAt: new Date().toISOString(),
    job: { stage: "understand", id: "job-1", attempt: 0, startedAt: Date.now(), usage: [], cost: 0, understand: { saveIds: ["a"], towns: [{ name: "Seoul", saves: 1 }] } } };
  const theirs = { ...row.job!, id: "job-2" };
  // While this worker looks, the row moves on to a job of the person's new ask.
  const late = deps({ internal: () => true, understand: { ...jobFromCall(async () => profileResult), check: async () => { row.job = theirs; return profileResult; } } }, row);
  const profileResult: ModelResult = { output: profile, refused: false, model: "m", usage: null };
  await handleWeave(post({ action: "resume", weaveId: WEAVE }), late);
  await late.settled();
  assertEquals([row.status, row.job?.id, late.refused.length], ["reading", "job-2", 1]);
  const cancelled: string[] = [];
  row.job = { ...theirs, id: "job-1" };
  const crashing = deps({ internal: () => true, understand: { ...jobFromCall(async () => profileResult), check: async () => { row.job = theirs; throw new Error("boom"); }, cancel: async (id) => { cancelled.push(id); } } }, row);
  await handleWeave(post({ action: "resume", weaveId: WEAVE }), crashing);
  await crashing.settled();
  // Its own job stopped; the row, theirs now, left as it is.
  assertEquals([cancelled, row.status, row.job?.id], [["job-1"], "reading", "job-2"]);
});

Deno.test("plan: two asks at once start one plan — the second finds the row changed since it read it and is told it is busy", async () => {
  const d = deps();
  const read = d.saves;
  // Between reading the row and writing it, another ask wrote it first.
  d.saves = async (u, towns) => { d.row.updatedAt = new Date(Date.now() + 5).toISOString(); return read(u, towns); };
  const res = await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), d);
  assertEquals([res.status, d.deferred.length, d.refused.length], [409, 0, 1]);
});

Deno.test("a model that answers in the asking is given only the time the worker has left to write it down", async () => {
  let given: number | undefined;
  const d = deps({ bornAt: Date.now() - 300_000, plan: jobFromCall(async (_s, user, _schema, timeoutMs) => { given = timeoutMs; return planned(user); }) });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: TWO_TOWNS }), d);
  await d.settled();
  const expected = WORKER_LIFE_MS - 300_000 - WRITE_MARGIN_MS;
  assert(given !== undefined && given <= expected && given > expected - 2_000, `the call was given ${given}`);
  assertEquals(d.row.status, "planned");
});

Deno.test("a crash stops the model job it left running", async () => {
  const cancelled: string[] = [];
  const job = backgroundJob(() => { throw new Error("boom"); }, 0, cancelled);
  const d = deps({ plan: job });
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), d);
  await d.settled();
  assertEquals([d.row.status, d.row.job, cancelled], ["failed", null, ["job-1"]]);
  // A job asked whose keeping on the row failed is stopped too: never left running unread.
  const lost: string[] = [];
  const e = deps({ plan: backgroundJob(planned, 0, lost) });
  const settle = e.settle;
  e.settle = async (id, patch, expect) => { if ("job" in patch && patch["job"]) throw new Error("connection reset"); return settle(id, patch, expect); };
  await handleWeave(post({ action: "plan", weaveId: WEAVE, brief: { days: 2, nights: [{ town: "Seoul", nights: 2 }] } }), e);
  await e.settled();
  assertEquals([e.row.status, lost], ["failed", ["job-1"]]);
});

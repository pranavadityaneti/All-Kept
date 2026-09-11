import { assertEquals } from "jsr:@std/assert@1";
import { compose, isDeadToken, notify, wants, type PushDeps } from "../_shared/push.ts";

const prefs = (over: Partial<{ enabled: boolean; sorted: boolean; attention: boolean }> = {}) =>
  ({ enabled: true, sorted: true, attention: true, ...over });

const deps = (over: Partial<PushDeps> = {}): PushDeps => ({
  fetch: (async () => Response.json({ data: [{ status: "ok" }] })) as typeof fetch,
  preferences: async () => prefs(),
  tokens: async () => [{ token: "ExponentPushToken[a]", platform: "ios" }],
  markDead: async () => {},
  log: () => {},
  ...over,
});

Deno.test("the master switch wins over the individual ones", () => {
  assertEquals(wants(prefs({ enabled: false }), "sorted").skipped, "disabled");
  assertEquals(wants(prefs({ enabled: false, sorted: true }), "sorted").skipped, "disabled");
  assertEquals(wants(prefs({ sorted: false }), "sorted").skipped, "muted");
  // Muting one kind must not mute the other.
  assertEquals(wants(prefs({ sorted: false }), "attention").ok, true);
  assertEquals(wants(null, "sorted").skipped, "no-profile");
});

Deno.test("nothing is sent to someone who has switched them off, and no request is made", async () => {
  let called = false;
  const r = await notify("u1", "sorted", { title: "t", body: "b", itemId: "i" },
    deps({ preferences: async () => prefs({ enabled: false }), fetch: (async () => { called = true; return Response.json({}); }) as typeof fetch }));
  assertEquals([r.sent, r.skipped, called], [0, "disabled", false]);
});

Deno.test("a device Expo has refused for good is recorded; a passing failure is not", async () => {
  const dead: string[] = [];
  const f = (async () => Response.json({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] })) as typeof fetch;
  await notify("u1", "sorted", { title: "t", body: "b", itemId: "i" }, deps({ fetch: f, markDead: async (t) => { dead.push(t); } }));
  assertEquals(dead, ["ExponentPushToken[a]"]);

  const other: string[] = [];
  const g = (async () => Response.json({ data: [{ status: "error", details: { error: "MessageRateExceeded" } }] })) as typeof fetch;
  await notify("u1", "sorted", { title: "t", body: "b", itemId: "i" }, deps({ fetch: g, markDead: async (t) => { other.push(t); } }));
  assertEquals(other, []);
  assertEquals(isDeadToken(undefined), false);
});

Deno.test("a push service that is down never fails the save", async () => {
  for (const f of [
    (async () => { throw new Error("network down"); }) as typeof fetch,
    (async () => new Response("nope", { status: 503 })) as typeof fetch,
  ]) {
    const r = await notify("u1", "sorted", { title: "t", body: "b", itemId: "i" }, deps({ fetch: f }));
    assertEquals(r.sent, 0); // returned, not thrown
  }
});

Deno.test("every device rings, and the tap carries the save it is about", async () => {
  let body: Record<string, unknown>[] = [];
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ data: [{ status: "ok" }, { status: "ok" }] });
  }) as typeof fetch;
  const r = await notify("u1", "sorted", { title: "t", body: "b", itemId: "item-9" },
    deps({ fetch: f, tokens: async () => [{ token: "A", platform: "ios" }, { token: "B", platform: "android" }] }));
  assertEquals(r.sent, 2);
  assertEquals(body.map((m) => m["to"]), ["A", "B"]);
  assertEquals((body[0]!["data"] as Record<string, unknown>)["itemId"], "item-9");
});

Deno.test("someone with no devices is not an error", async () => {
  const r = await notify("u1", "sorted", { title: "t", body: "b", itemId: "i" }, deps({ tokens: async () => [] }));
  assertEquals([r.sent, r.skipped], [0, "no-devices"]);
});

Deno.test("what it says fits a lock screen and never claims a category it does not have", () => {
  assertEquals(compose("sorted", { title: "How icon morphing works", category: "Tech & tools" }),
    { title: "Saved", body: "How icon morphing works is in Tech & tools." });
  assertEquals(compose("sorted", { title: "How icon morphing works", category: null }),
    { title: "Saved", body: "How icon morphing works is in your library." });
  // An untitled save still reads as a sentence rather than as an empty gap.
  assertEquals(compose("sorted", { title: "   ", category: "Notes" }), { title: "Saved", body: "Your save is in Notes." });
  assertEquals(compose("attention", { title: null, category: null }).title, "A save needs you");
});

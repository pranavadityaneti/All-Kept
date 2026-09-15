import { assertEquals } from "jsr:@std/assert@1";
import { handleCategorySummary, REFRESH_EVERY_MS, THEMES_PROMPT, themesFrom, type CategorySummaryDeps, type SummarySource } from "../category-summary/handler.ts";

const NOW = new Date("2026-09-16T10:00:00Z");
const request = (body: unknown, method = "POST") => new Request("https://example.test/category-summary", { method, body: method === "POST" ? JSON.stringify(body) : null });
const source = (over: Partial<SummarySource> = {}): SummarySource => ({
  count: 12, fingerprint: "f1", shapes: { vertical: 9, post: 3 }, intents: { try: 4, buy: 2 },
  names: [{ name: "Claude", kind: "tool", icon: "chatbubbles", n: 5 }, { name: "Codex", kind: "tool", icon: "code-slash", n: 3 }],
  saves: [{ summary: "Setting up Claude Code agents", tags: ["ai", "agents"], names: ["Claude"] }, { summary: "Codex for refactors", tags: ["ai"], names: ["Codex"] }, { summary: "A tape measure challenge", tags: ["fun"], names: [] }],
  ...over,
});
function fake(over: Partial<CategorySummaryDeps> = {}) {
  const written: { fingerprint: string; themes: string[]; model: string }[] = [];
  const asked: string[] = [];
  const deps: CategorySummaryDeps = {
    userId: async () => "u1",
    source: async () => source(),
    sortingEnabled: async () => true,
    stored: async () => null,
    write: async (_u, _c, fingerprint, themes, model) => { written.push({ fingerprint, themes, model }); },
    call: async (_s, user) => { asked.push(user); return { output: { themes: ["Claude Code workflows and agent setups", "Codex for refactors", "One tape-measure challenge"] }, refused: false, model: "test-model", usage: null }; },
    now: () => NOW,
    log: () => {},
    ...over,
  };
  return { deps, written, asked };
}
const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

Deno.test("a category never summarised gets its themes written from the model, with the facts alongside", async () => {
  const f = fake();
  const r = await handleCategorySummary(request({ category: "Tech & tools" }), f.deps);
  assertEquals(r.status, 200);
  const j = await body(r);
  assertEquals(j["themes"], ["Claude Code workflows and agent setups", "Codex for refactors", "One tape-measure challenge"]);
  assertEquals([j["count"], j["shapes"], j["intents"], j["freshness"]], [12, { vertical: 9, post: 3 }, { try: 4, buy: 2 }, "fresh"]);
  assertEquals(j["names"], [{ name: "Claude", kind: "tool", icon: "chatbubbles", n: 5 }, { name: "Codex", kind: "tool", icon: "code-slash", n: 3 }]);
  assertEquals(f.written, [{ fingerprint: "f1", themes: ["Claude Code workflows and agent setups", "Codex for refactors", "One tape-measure challenge"], model: "test-model" }]);
  // The model sees the derived fields only — summaries, tags, names — never a caption.
  const sent = JSON.parse(f.asked[0]!) as unknown[];
  assertEquals(sent.length, 3);
  assertEquals(Object.keys(sent[0] as object).sort(), ["names", "summary", "tags"]);
});

Deno.test("unchanged members mean the stored themes come back and the model is not asked", async () => {
  const f = fake({ stored: async () => ({ fingerprint: "f1", themes: ["Stored theme"], updated_at: "2026-09-10T00:00:00Z" }), call: async () => { throw new Error("must not ask"); } });
  const j = await body(await handleCategorySummary(request({ category: "Tech & tools" }), f.deps));
  assertEquals([j["themes"], j["freshness"]], [["Stored theme"], "stored"]);
  assertEquals(f.written, []);
});

Deno.test("members changed within the last hour: the stored themes stand until the hour is up", async () => {
  const recent = new Date(NOW.getTime() - REFRESH_EVERY_MS + 60_000).toISOString();
  const f = fake({ stored: async () => ({ fingerprint: "old", themes: ["Stored theme"], updated_at: recent }), call: async () => { throw new Error("must not ask"); } });
  const j = await body(await handleCategorySummary(request({ category: "Tech & tools" }), f.deps));
  assertEquals([j["themes"], j["freshness"]], [["Stored theme"], "stored"]);
  const due = new Date(NOW.getTime() - REFRESH_EVERY_MS - 1).toISOString();
  const g = fake({ stored: async () => ({ fingerprint: "old", themes: ["Stored theme"], updated_at: due }) });
  assertEquals((await body(await handleCategorySummary(request({ category: "Tech & tools" }), g.deps)))["freshness"], "fresh");
  assertEquals(g.written.length, 1);
});

Deno.test("fewer than three saves: the facts, no themes, nothing asked or written", async () => {
  const f = fake({ source: async () => source({ count: 2, saves: [] }), call: async () => { throw new Error("must not ask"); } });
  const j = await body(await handleCategorySummary(request({ category: "Wedding" }), f.deps));
  assertEquals([j["count"], j["themes"], j["freshness"]], [2, [], "none"]);
  assertEquals(f.written, []);
});

Deno.test("sorting switched off: the facts only, and the model is never asked", async () => {
  const f = fake({ sortingEnabled: async () => false, call: async () => { throw new Error("must not ask"); } });
  const j = await body(await handleCategorySummary(request({ category: "Tech & tools" }), f.deps));
  assertEquals([j["themes"], j["sortingOff"], j["count"]], [[], true, 12]);
});

Deno.test("a model that fails, refuses or answers badly leaves the stored themes, or none, and the facts still come back", async () => {
  const stored = async () => ({ fingerprint: "old", themes: ["Stored theme"], updated_at: "2026-09-10T00:00:00Z" });
  for (const call of [
    async () => ({ output: null, refused: false, model: "m", usage: null, error: "openai 503" }),
    async () => ({ output: null, refused: true, model: "m", usage: null }),
    async () => ({ output: { themes: "not a list" }, refused: false, model: "m", usage: null }),
    async () => { throw new Error("network down"); },
  ]) {
    const f = fake({ stored, call: call as CategorySummaryDeps["call"] });
    const j = await body(await handleCategorySummary(request({ category: "Tech & tools" }), f.deps));
    assertEquals([j["themes"], j["freshness"], j["count"]], [["Stored theme"], "stored", 12]);
    assertEquals(f.written, []);
  }
  const none = fake({ call: async () => ({ output: null, refused: false, model: "m", usage: null, error: "openai 503" }) });
  assertEquals((await body(await handleCategorySummary(request({ category: "Tech & tools" }), none.deps)))["themes"], []);
  const unconfigured = fake({ call: null });
  assertEquals((await body(await handleCategorySummary(request({ category: "Tech & tools" }), unconfigured.deps)))["themes"], []);
});

Deno.test("themes are trimmed to three short lines and anything else is refused", () => {
  assertEquals(themesFrom({ themes: ["  A theme  ", "", "B", "C", "D"] }), ["A theme", "B", "C"]);
  assertEquals(themesFrom({ themes: ["x".repeat(200)] }), ["x".repeat(90)]);
  assertEquals(themesFrom({ themes: [] }), null);
  assertEquals(themesFrom({ themes: [1, 2] }), null);
  assertEquals(themesFrom("nope"), null);
  assertEquals(THEMES_PROMPT.includes("three") && THEMES_PROMPT.includes("90"), true);
});

Deno.test("only a signed-in POST with a category is answered", async () => {
  assertEquals((await handleCategorySummary(request({ category: "Tech & tools" }, "GET"), fake().deps)).status, 400);
  assertEquals((await handleCategorySummary(request({ category: "Tech & tools" }), fake({ userId: async () => null }).deps)).status, 401);
  assertEquals((await handleCategorySummary(request({}), fake().deps)).status, 400);
  assertEquals((await handleCategorySummary(request({ category: "x".repeat(81) }), fake().deps)).status, 400);
});

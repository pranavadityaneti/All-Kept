import { assertEquals } from "jsr:@std/assert@1";
import { handleSearch, type SearchDeps } from "../search-library/handler.ts";
import { cachedQueryEmbedder, embedder, EMBEDDING_DIMENSIONS } from "../_shared/embeddings.ts";
const vector = Array(EMBEDDING_DIMENSIONS).fill(0.1);
const request = (body: unknown) => new Request("https://example.test/search", { method: "POST", body: JSON.stringify(body) });
const defaults: SearchDeps = { authenticate: async () => true, query: async () => [], embed: async () => [vector] };
Deno.test("unauthenticated searches cannot invoke a paid embedding call or query", async () => {
  const response = await handleSearch(request({ q: "recipes" }), { authenticate: async () => false, embed: () => { throw new Error("must not call"); }, query: () => { throw new Error("must not query"); } });
  assertEquals(response.status, 401);
});
Deno.test("provider failure falls back to the complete keyword query", async () => {
  let args: Record<string, unknown> = {};
  const response = await handleSearch(request({ q: "  chick protein ", platforms: ["instagram"] }), { ...defaults, embed: () => { throw new Error("503"); }, query: async (_, input) => { args = input; return []; } });
  assertEquals((await response.json()).mode, "keyword");
  assertEquals(args.q, "chick protein");
  assertEquals(args.query_embedding, null);
  assertEquals(args.platforms, ["instagram"]);
});
Deno.test("search returns 30 plus a cursor and reuses the vector on later pages", async () => {
  let calls = 0;
  let before: unknown;
  const rows = Array.from({ length: 31 }, (_, i) => ({ id: `20000000-0000-0000-0000-${String(i).padStart(12, "0")}`, score: 4, last_saved_at: "2026-09-09T00:00:00Z" }));
  const deps = { ...defaults, embed: async () => { calls++; return [vector]; }, query: async (_: Request, args: Record<string, unknown>) => { before = args.before; return rows; } };
  const first = await (await handleSearch(request({ q: "chicken" }), deps)).json();
  assertEquals(first.items.length, 30);
  assertEquals(first.nextCursor.id, rows[29]!.id);
  await handleSearch(request({ q: "chicken", cursor: first.nextCursor }), deps);
  assertEquals(calls, 1);
  assertEquals(before, { id: rows[29]!.id, savedAt: rows[29]!.last_saved_at, score: 4 });
});
Deno.test("invalid cursors, filters and overlong queries fail before embedding", async () => {
  for (const body of [{ q: "a".repeat(301) }, { q: "a", platforms: "instagram" }, { q: "a", cursor: { embedding: [] } }, { q: " " }]) {
    assertEquals((await handleSearch(request(body), { ...defaults, embed: () => { throw new Error("must not run"); } })).status, 400);
  }
});
Deno.test("embedding adapter validates dimensions and handles out of order batch responses", async () => {
  let sent: Record<string, unknown> = {};
  const embed = embedder("test", (async (_, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: [{ index: 1, embedding: vector.map((n) => n * 2) }, { index: 0, embedding: vector }] }));
  }) as typeof fetch);
  const result = await embed(["Hello", "नमस्ते".repeat(4000)]);
  assertEquals(result[0], vector);
  assertEquals(result[1]![0], 0.2);
  assertEquals(sent.dimensions, 512);
  assertEquals(new TextEncoder().encode((sent.input as string[])[1]).byteLength <= 6000, true);
});

Deno.test("realtime refreshes reuse query vectors until expiry", async () => {
  let calls = 0, now = 0;
  const embed = cachedQueryEmbedder(async () => { calls++; return [vector]; }, () => now);
  await Promise.all([embed(["recipes"]), embed(["recipes"])]);
  assertEquals(calls, 1);
  now = 300_001;
  await embed(["recipes"]);
  assertEquals(calls, 2);
});
Deno.test("failed embeddings are not cached", async () => {
  let calls = 0;
  const embed = cachedQueryEmbedder(async () => { calls++; if (calls === 1) throw new Error("429"); return [vector]; });
  await embed(["recipes"]).catch(() => undefined);
  await embed(["recipes"]);
  assertEquals(calls, 2);
});

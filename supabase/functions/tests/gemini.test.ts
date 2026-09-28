import { assert, assertEquals } from "jsr:@std/assert@1";
import { geminiDeps, normaliseUsage, OUTPUT_SCHEMA } from "../_shared/gemini.ts";
import { classifierFromEnv, GEMINI_BULK_MODEL } from "../_shared/classifiers.ts";
import { costUsd, PRICES_PER_MTOK } from "../_shared/pipeline.ts";
import { retryableClassificationError } from "../_shared/classification-worker.ts";
import { SYSTEM_PROMPT } from "../_shared/classify.ts";

const GOOD = { category: "Money & career", tags: ["uber", "startups"], summary: "Kalanick on the details that let Uber beat Lyft.", entities: [{ type: "person", name: "Travis Kalanick" }], language: "en", actionability: "watch", confidence: 0.92 };
// Shape of a generateContent reply: one candidate, a model version, usage split like OpenAI's.
const reply = (over: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }], role: "model" }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1900, cachedContentTokenCount: 1280, candidatesTokenCount: 210, thoughtsTokenCount: 0 },
  modelVersion: "gemini-2.5-flash-002",
  ...over,
});
const fetchWith = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
  seen.url = String(url); seen.init = init;
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

Deno.test("gemini: a stopped reply yields the parsed JSON, the reported model version and normalised usage", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const r = await geminiDeps("k-test", "gemini-2.5-flash", fetchWith(200, reply(), seen)).call(SYSTEM_PROMPT, "caption: x");
  assertEquals([r.error, r.refused, r.model], [undefined, false, "gemini-2.5-flash-002"]);
  assertEquals(r.output, GOOD);
  assertEquals(r.usage, { input_tokens: 620, output_tokens: 210, cache_read_input_tokens: 1280 });
  const body = JSON.parse(String(seen.init!.body)) as Record<string, unknown>;
  assertEquals(seen.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  assertEquals((seen.init!.headers as Record<string, string>)["x-goog-api-key"], "k-test");
  assertEquals(body["systemInstruction"], { parts: [{ text: SYSTEM_PROMPT }] });
  assertEquals(body["contents"], [{ role: "user", parts: [{ text: "caption: x" }] }]);
  const gen = body["generationConfig"] as Record<string, unknown>;
  assertEquals([gen["responseMimeType"], gen["responseJsonSchema"], gen["thinkingConfig"]], ["application/json", OUTPUT_SCHEMA, { thinkingBudget: 0 }]);
});

Deno.test("gemini: a safety block and a blocked prompt are refusals; MAX_TOKENS, non-JSON, HTTP and transport errors each map to a recorded result", async () => {
  const d = (status: number, body: unknown) => geminiDeps("k-test", "gemini-2.5-flash", fetchWith(status, body));
  const safety = await d(200, reply({ candidates: [{ finishReason: "SAFETY" }] })).call("s", "u");
  assertEquals([safety.refused, safety.output], [true, null]);
  const blocked = await d(200, reply({ candidates: [], promptFeedback: { blockReason: "SAFETY" } })).call("s", "u");
  assertEquals([blocked.refused, blocked.output], [true, null]);
  const cut = await d(200, reply({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] })).call("s", "u");
  assertEquals(cut.error, "incomplete: max_output_tokens");
  const junk = await d(200, reply({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{not json" }] } }] })).call("s", "u");
  assertEquals(junk.error, "model returned non-JSON");
  const limited = await d(429, { error: { code: 429, message: "Resource has been exhausted (quota)", status: "RESOURCE_EXHAUSTED" } }).call("s", "u");
  assertEquals([limited.error, limited.usage], ["gemini 429: Resource has been exhausted (quota)", null]);
  const down = await geminiDeps("k", "gemini-2.5-flash", (async () => { throw new TypeError("connection reset"); }) as typeof fetch).call("s", "u");
  assert(down.error!.includes("connection reset"));
  assertEquals(down.model, "gemini-2.5-flash");
});

Deno.test("gemini: a bad key and a missing model are terminal; a quota 429 and a timeout retry", () => {
  assertEquals(retryableClassificationError("gemini 400: API key not valid"), false);
  assertEquals(retryableClassificationError("gemini 403: permission denied"), false);
  assertEquals(retryableClassificationError("gemini 404: model gemini-2.5-flash not found"), false);
  assertEquals(retryableClassificationError("refused"), false);
  assertEquals(retryableClassificationError("gemini 429: Resource has been exhausted (quota)"), true);
  assertEquals(retryableClassificationError("incomplete: max_output_tokens"), true);
});

Deno.test("gemini: thinking tokens are billed as output and kept apart; usage tolerates missing metadata", () => {
  assertEquals(normaliseUsage({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 12 }), { input_tokens: 100, output_tokens: 32, cache_read_input_tokens: 0, reasoning_tokens: 12 });
  assertEquals(normaliseUsage({ promptTokenCount: 10, cachedContentTokenCount: 50, candidatesTokenCount: 1 })!.input_tokens, 0);
  assertEquals(normaliseUsage(undefined), null);
});

Deno.test("gemini: the picture travels as an inline_data part before the words; without one the words go alone", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const deps = geminiDeps("k", "gemini-2.5-flash", fetchWith(200, reply(), seen));
  await deps.call("sys", "the words", undefined, { mediaType: "image/jpeg", base64: "AAAA" });
  const parts = (JSON.parse(String(seen.init?.body)) as { contents: { parts: unknown[] }[] }).contents[0]!.parts;
  assertEquals(parts, [{ inline_data: { mime_type: "image/jpeg", data: "AAAA" } }, { text: "the words" }]);
  await deps.call("sys", "the words");
  assertEquals((JSON.parse(String(seen.init?.body)) as { contents: { parts: unknown[] }[] }).contents[0]!.parts, [{ text: "the words" }]);
});

Deno.test("classifierFromEnv: Gemini is chosen when its key is set and OpenAI's is not, with its own tiers, and CLASSIFIER_MODEL names its model", () => {
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const g = classifierFromEnv(env({ GEMINI_API_KEY: "k" }));
  assertEquals([g?.vendor, g?.model], ["gemini", "gemini-2.5-flash"]);
  assertEquals(classifierFromEnv(env({ GEMINI_API_KEY: "k" }), { bulk: true })?.model, GEMINI_BULK_MODEL);
  assertEquals(classifierFromEnv(env({ GEMINI_API_KEY: "k", CLASSIFIER_MODEL: "gemini-2.5-pro" }))?.model, "gemini-2.5-pro");
  // OpenAI still wins while its key is present, so the switch is pulling that key, not a code change.
  assertEquals(classifierFromEnv(env({ OPENAI_API_KEY: "sk", GEMINI_API_KEY: "k" }))?.vendor, "openai");
});

Deno.test("gemini: both tiers are priced, and flash-lite is not billed at the flash rate despite the shared prefix", () => {
  const usage = { input_tokens: 600, output_tokens: 180, cache_read_input_tokens: 1200 };
  assertEquals(costUsd("gemini-2.5-flash-002", usage), (600 * 0.3 + 180 * 2.5 + 1200 * 0.075) / 1e6);
  assertEquals(costUsd("gemini-2.5-flash-lite", usage), (600 * 0.1 + 180 * 0.4 + 1200 * 0.025) / 1e6);
  assert(Object.keys(PRICES_PER_MTOK).includes(GEMINI_BULK_MODEL));
  assert(PRICES_PER_MTOK[GEMINI_BULK_MODEL]!.input < PRICES_PER_MTOK["gemini-2.5-flash"]!.input);
});

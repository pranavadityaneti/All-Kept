import { assert, assertEquals } from "jsr:@std/assert@1";
import { normaliseUsage, openaiDeps, OUTPUT_SCHEMA } from "../_shared/openai.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { costUsd, PRICES_PER_MTOK } from "../_shared/pipeline.ts";
import { SYSTEM_PROMPT } from "../_shared/classify.ts";

const GOOD = { category: "Money & career", tags: ["uber", "startups"], summary: "Kalanick on the details that let Uber beat Lyft.", entities: [{ type: "person", name: "Travis Kalanick" }], language: "en", actionability: "watch", confidence: 0.92 };
// Shape of a Responses API reply as documented: a reasoning item, then the message; usage counts cached tokens inside input_tokens.
const reply = (over: Record<string, unknown> = {}) => ({
  id: "resp_1", object: "response", status: "completed", model: "gpt-5.6-sol-2026-08-01",
  output: [{ type: "reasoning", summary: [] }, { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(GOOD), annotations: [] }] }],
  usage: { input_tokens: 1900, input_tokens_details: { cached_tokens: 1280 }, output_tokens: 210, output_tokens_details: { reasoning_tokens: 40 }, total_tokens: 2110 },
  ...over,
});
const fetchWith = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
  seen.url = String(url); seen.init = init;
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

Deno.test("openai: a completed reply yields the parsed JSON, the dated model id and normalised usage", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const r = await openaiDeps("sk-test", "gpt-5.6-sol", fetchWith(200, reply(), seen)).call(SYSTEM_PROMPT, "caption: x");
  assertEquals([r.error, r.refused, r.model], [undefined, false, "gpt-5.6-sol-2026-08-01"]);
  assertEquals(r.output, GOOD);
  assertEquals(r.usage, { input_tokens: 620, output_tokens: 210, cache_read_input_tokens: 1280, reasoning_tokens: 40 });
  const body = JSON.parse(String(seen.init!.body)) as Record<string, unknown>;
  assertEquals(seen.url, "https://api.openai.com/v1/responses");
  assertEquals((seen.init!.headers as Record<string, string>)["authorization"], "Bearer sk-test");
  assertEquals([body["model"], body["instructions"], body["input"], body["store"]], ["gpt-5.6-sol", SYSTEM_PROMPT, "caption: x", false]);
  assertEquals(body["text"], { format: { type: "json_schema", name: "item_ai", schema: OUTPUT_SCHEMA, strict: true } });
  assertEquals(body["reasoning"], { effort: "low" });
});

Deno.test("openai: refusal, truncation, non-JSON, HTTP errors and transport failures each map to a result the pipeline records", async () => {
  const d = (status: number, body: unknown) => openaiDeps("sk-test", "gpt-5.6-sol", fetchWith(status, body));
  const refused = await d(200, reply({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).call("s", "u");
  assertEquals([refused.refused, refused.output], [true, null]);
  const cut = await d(200, reply({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).call("s", "u");
  assertEquals(cut.error, "incomplete: max_output_tokens");
  const junk = await d(200, reply({ output: [{ type: "message", content: [{ type: "output_text", text: "{not json" }] }] })).call("s", "u");
  assertEquals(junk.error, "model returned non-JSON");
  const limited = await d(429, { error: { message: "Rate limit reached for gpt-5.6-sol", type: "rate_limit_error" } }).call("s", "u");
  assertEquals([limited.error, limited.usage], ["openai 429: Rate limit reached for gpt-5.6-sol", null]);
  const down = await openaiDeps("sk-test", "gpt-5.6-sol", (async () => { throw new TypeError("connection reset"); }) as typeof fetch).call("s", "u");
  assert(down.error!.includes("connection reset"));
  assertEquals(down.model, "gpt-5.6-sol");
});

Deno.test("openai: usage normalisation never goes negative and tolerates missing details", () => {
  assertEquals(normaliseUsage({ input_tokens: 100, output_tokens: 5 }), { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 0 });
  assertEquals(normaliseUsage({ input_tokens: 10, input_tokens_details: { cached_tokens: 50 }, output_tokens: 1 })!.input_tokens, 0);
  assertEquals(normaliseUsage(undefined), null);
});

Deno.test("OUTPUT_SCHEMA satisfies strict mode: every object lists all properties as required and forbids extras", () => {
  const check = (node: Record<string, unknown>) => {
    if (node["type"] === "object") {
      const props = Object.keys(node["properties"] as Record<string, unknown>);
      assertEquals(node["required"], props);
      assertEquals(node["additionalProperties"], false);
      for (const v of Object.values(node["properties"] as Record<string, Record<string, unknown>>)) check(v);
    }
    if (node["type"] === "array") check(node["items"] as Record<string, unknown>);
  };
  check(OUTPUT_SCHEMA as unknown as Record<string, unknown>);
});

Deno.test("cost uses the price of the model the vendor reports, with dated ids, and refuses to guess unknown models", () => {
  const usage = { input_tokens: 600, output_tokens: 180, cache_read_input_tokens: 1200 };
  assertEquals(costUsd("gpt-5.6-sol-2026-08-01", usage), 0.00648);
  assertEquals(costUsd("gpt-5.6-terra", usage), 0.0036);
  assertEquals(costUsd("claude-opus-5", { ...usage, cache_creation_input_tokens: 1200 }), (600 * 5 + 180 * 25 + 1200 * 0.5 + 1200 * 6.25) / 1e6);
  assertEquals(costUsd("gpt-4o", usage), null);
  assertEquals(costUsd("gpt-5.6-sol", null), null);
  assert(Object.keys(PRICES_PER_MTOK).includes("gpt-5.6-luna"));
});

Deno.test("classifierFromEnv: OpenAI key wins, CLASSIFIER_MODEL names its model, Claude is the fallback, none otherwise", () => {
  const env = (vars: Record<string, string>) => (n: string) => vars[n];
  const both = classifierFromEnv(env({ OPENAI_API_KEY: "sk-a", ANTHROPIC_API_KEY: "sk-ant", CLASSIFIER_MODEL: "gpt-5.6-terra" }));
  assertEquals([both?.vendor, both?.model], ["openai", "gpt-5.6-terra"]);
  assertEquals(classifierFromEnv(env({ OPENAI_API_KEY: "sk-a" }))?.model, "gpt-5.6-sol");
  const claude = classifierFromEnv(env({ OPENAI_API_KEY: "  ", ANTHROPIC_API_KEY: "sk-ant" }));
  assertEquals([claude?.vendor, claude?.model], ["anthropic", "claude-opus-5"]);
  assertEquals(classifierFromEnv(env({})), null);
});

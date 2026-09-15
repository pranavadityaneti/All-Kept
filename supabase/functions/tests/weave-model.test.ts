import { assert, assertEquals } from "jsr:@std/assert@1";
import { OPENAI_MODEL, PLAN_OPTIONS, weaveModelOpenAI } from "../_shared/weave/model.ts";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

Deno.test("the OpenAI call carries the instructions, the strict schema and the effort, and reads the answer, its usage and its refusals the way the sorter does", async () => {
  let sent: Record<string, unknown> = {};
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ model: "gpt-5.6-sol-2026-08", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ overview: "hi" }) }] }], usage: { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 50 } } });
  }) as typeof fetch;
  const call = weaveModelOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, f);
  const r = await call("sys", "user", { type: "object" });
  assertEquals(r.output, { overview: "hi" });
  assertEquals([r.model, r.usage?.input_tokens, r.usage?.cache_read_input_tokens, r.usage?.reasoning_tokens], ["gpt-5.6-sol-2026-08", 1000, 200, 50]);
  assertEquals([sent["model"], sent["instructions"], sent["input"], sent["max_output_tokens"], sent["store"]], [OPENAI_MODEL, "sys", "user", PLAN_OPTIONS.maxTokens, false]);
  assertEquals((sent["reasoning"] as { effort: string }).effort, "high");
  const format = (sent["text"] as { format: Record<string, unknown> }).format;
  assertEquals([format["type"], format["strict"], format["schema"]], ["json_schema", true, { type: "object" }]);
  assert(!("fallbacks" in sent));
  const refused = await weaveModelOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, reply({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }))("s", "u", {});
  assertEquals(refused.refused, true);
  const cut = await weaveModelOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, reply({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }))("s", "u", {});
  assertEquals(cut.error, "incomplete: max_output_tokens");
  const down = await weaveModelOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, reply({ error: { message: "quota" } }, 429))("s", "u", {});
  assertEquals(down.error, "openai 429: quota");
});

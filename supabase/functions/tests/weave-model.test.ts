import { assert, assertEquals } from "jsr:@std/assert@1";
import { jobFromCall, OPENAI_MODEL, PLAN_OPTIONS, weaveJobOpenAI } from "../_shared/weave/model.ts";

type Sent = { url: string; method: string; body: Record<string, unknown> | null };
/** A fake OpenAI: answers each request with the next reply, and keeps what was sent. */
function openai(...replies: { body: unknown; status?: number }[]) {
  const sent: Sent[] = [];
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(u), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null });
    const r = replies.shift() ?? { body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, sent };
}
const done = (text: unknown, usage = { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 50 } }) =>
  ({ id: "resp_1", model: "gpt-6-astra-2026-09", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(text) }] }], usage });

Deno.test("a plan is asked in the background — the instructions, the strict schema, the effort, nothing kept — and the answer is looked for until it comes", async () => {
  const { f, sent } = openai({ body: { id: "resp_1", status: "queued" } }, { body: { id: "resp_1", status: "in_progress" } }, { body: done({ overview: "hi" }) });
  const job = weaveJobOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, f);
  const started = await job.start("sys", "user", { type: "object" });
  assertEquals(started, { id: "resp_1" });
  const b = sent[0]!.body!;
  assertEquals([sent[0]!.url, sent[0]!.method, b["background"], b["store"], b["model"], b["instructions"], b["input"], b["max_output_tokens"]],
    ["https://api.openai.com/v1/responses", "POST", true, false, OPENAI_MODEL, "sys", "user", PLAN_OPTIONS.maxTokens]);
  assertEquals((b["reasoning"] as { effort: string }).effort, "high");
  const format = (b["text"] as { format: Record<string, unknown> }).format;
  assertEquals([format["type"], format["strict"], format["schema"]], ["json_schema", true, { type: "object" }]);
  assertEquals(await job.check("resp_1"), null);
  const r = await job.check("resp_1");
  assertEquals([sent[1]!.url, sent[1]!.method], ["https://api.openai.com/v1/responses/resp_1", "GET"]);
  assertEquals(r?.output, { overview: "hi" });
  assertEquals([r?.model, r?.usage?.input_tokens, r?.usage?.cache_read_input_tokens, r?.usage?.reasoning_tokens], ["gpt-6-astra-2026-09", 1000, 200, 50]);
});

Deno.test("an answer that comes back at once is handed over at once; a refusal to start is a failure with the provider's words", async () => {
  const quick = await weaveJobOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, openai({ body: done({ overview: "fast" }) }).f).start("s", "u", {});
  assertEquals("result" in quick && quick.result.output, { overview: "fast" });
  const down = await weaveJobOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, openai({ body: { error: { message: "quota" } }, status: 429 }).f).start("s", "u", {});
  assertEquals("result" in down && down.result.error, "openai 429: quota");
});

Deno.test("how a finished job reads: refused, cut short, failed, cancelled, gone, not JSON — or not yet, when the provider is only busy", async () => {
  const check = async (body: unknown, status = 200) => await weaveJobOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, openai({ body, status }).f).check("resp_1");
  assertEquals((await check({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }))?.refused, true);
  assertEquals((await check({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }))?.error, "incomplete: max_output_tokens");
  assertEquals((await check({ status: "failed", error: { message: "server_error" } }))?.error, "failed: server_error");
  assertEquals((await check({ status: "cancelled" }))?.error, "cancelled");
  assertEquals((await check({ error: { message: "No response found" } }, 404))?.error, "openai 404: No response found");
  assertEquals((await check({ error: { message: "invalid key" } }, 401))?.error, "openai 401: invalid key");
  // Busy or down for a moment is not an answer: looked at again.
  assertEquals(await check({ error: { message: "rate limited" } }, 429), null);
  assertEquals(await check({ error: { message: "bad gateway" } }, 502), null);
  assertEquals((await check({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }))?.error, "model returned non-JSON");
});

Deno.test("a job nobody will read is cancelled", async () => {
  const { f, sent } = openai({ body: { status: "cancelled" } });
  await weaveJobOpenAI("k", OPENAI_MODEL, PLAN_OPTIONS, f).cancel("resp_1");
  assertEquals([sent[0]!.url, sent[0]!.method], ["https://api.openai.com/v1/responses/resp_1/cancel", "POST"]);
});

Deno.test("a provider without background jobs answers in the asking, within the time it is given: the answer is handed over at once", async () => {
  let given: number | undefined;
  const job = jobFromCall(async (_s, _u, _schema, timeoutMs) => { given = timeoutMs; return { output: { overview: "x" }, refused: false, model: "claude-fable-5-1", usage: null }; });
  const started = await job.start("s", "u", {}, 90_000);
  assertEquals(given, 90_000);
  assert("result" in started);
  assertEquals(started.result.output, { overview: "x" });
  assertEquals(await job.check("anything"), null);
});

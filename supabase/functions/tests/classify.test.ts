import { assertEquals } from "jsr:@std/assert@1";
import { classify, buildUserMessage, validateOutput, SYSTEM_PROMPT, type ClassifyDeps } from "../_shared/classify.ts";

const input = { platform: "instagram", kind: "short_video", url: "https://www.instagram.com/reel/DcVMQIIMa5-/", title: null, text: "Travis Kalanick on the little details that made Uber beat Lyft", author: "davidsenra", note: null };
const fake = (result: unknown, extra: Partial<Awaited<ReturnType<ClassifyDeps["call"]>>> = {}): ClassifyDeps => ({ async call() { return { output: result, refused: false, model: "claude-opus-5", usage: { input_tokens: 400, output_tokens: 90 }, ...extra }; } });

Deno.test("a valid model answer is normalised into the AI output", async () => {
  const r = await classify(input, fake({ category: "Money & career", tags: ["#Uber", "startups", "uber", "  Lyft ", "x", "y", "z"], summary: "A".repeat(200), entities: [{ type: "brand", name: "Uber" }, { type: "weird", name: "Lyft" }, { type: "person", name: "" }], language: "EN", actionability: "watch", confidence: 1.4 }));
  assertEquals(r.error, null);
  assertEquals(r.output!.category, "Money & career");
  assertEquals(r.output!.tags, ["uber", "startups", "lyft", "x", "y"]);
  assertEquals(r.output!.summary.length, 140);
  assertEquals(r.output!.entities, [{ type: "brand", name: "Uber" }, { type: "other", name: "Lyft" }]);
  assertEquals([r.output!.language, r.output!.actionability, r.output!.confidence], ["en", "watch", 1]);
  assertEquals(r.usage?.input_tokens, 400);
});

Deno.test("an unknown category, a refusal and a transport error all yield no output with an error", async () => {
  assertEquals((await classify(input, fake({ category: "Cats", tags: [] }))).error, "invalid model output");
  assertEquals((await classify(input, fake(null, { refused: true }))).error, "refused");
  assertEquals((await classify(input, fake(null, { error: "429 rate limited" }))).error, "429 rate limited");
  assertEquals(validateOutput("nope"), null);
});

Deno.test("the user message carries the fields and clips long text; the system prompt lists every category", () => {
  const msg = buildUserMessage({ ...input, text: "x".repeat(2000) });
  assertEquals(msg.includes("platform: instagram"), true);
  assertEquals(msg.includes("x".repeat(1500) + "…"), true);
  assertEquals(SYSTEM_PROMPT.includes("Food & recipes") && SYSTEM_PROMPT.includes("People & personal"), true);
});

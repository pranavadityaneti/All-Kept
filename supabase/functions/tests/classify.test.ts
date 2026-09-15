import { assertEquals } from "jsr:@std/assert@1";
import { classify, buildUserMessage, validateOutput, PROMPT_VERSION, SYSTEM_PROMPT, TIE_BREAKERS, type ClassifyDeps, type Picture } from "../_shared/classify.ts";
import { CATEGORIES, CATEGORY_GUIDE, UNSURE_BELOW } from "../_shared/contracts.ts";

const input = { platform: "instagram", kind: "short_video", url: "https://www.instagram.com/reel/DcVMQIIMa5-/", title: null, text: "Travis Kalanick on the little details that made Uber beat Lyft", author: "davidsenra", note: null, language: "en", savedAt: "2026-09-15T08:00:00Z" };
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

Deno.test("the user message carries the fields and clips long text; the system prompt defines every category and breaks the ties", () => {
  const msg = buildUserMessage({ ...input, text: "x".repeat(2000), language: "ja" });
  assertEquals(msg.includes("platform: instagram"), true);
  assertEquals(msg.includes("x".repeat(1500) + "…"), true);
  assertEquals(msg.includes("write in: ja"), true);
  // Every category is named with its definition, not as a bare label in a list.
  for (const c of CATEGORIES) assertEquals(SYSTEM_PROMPT.includes(`- ${c} — ${CATEGORY_GUIDE[c]}`), true, c);
  // Every tie-breaker names at least one real category, so a rename cannot leave a rule pointing at nothing.
  assertEquals(TIE_BREAKERS.length >= 8, true);
  for (const rule of TIE_BREAKERS) assertEquals(CATEGORIES.some((c) => rule.includes(c)), true, rule);
  assertEquals(SYSTEM_PROMPT.includes("never the fallback") && SYSTEM_PROMPT.includes(String(UNSURE_BELOW)), true);
  // The summary follows the reader, not the post.
  assertEquals(SYSTEM_PROMPT.includes("write in"), true);
});

Deno.test("a venue and a date are kept when they are what the post names, and refused when they are not", () => {
  const answer = { category: "Food & recipes", tags: [], summary: "", entities: [], language: "en", actionability: "go", confidence: 0.9 };
  const now = new Date("2026-09-15T08:00:00Z");
  const full = validateOutput({ ...answer, venue: { name: " Haku ", locality: "Bandra, Mumbai" }, event_at: "2026-10-12" }, now)!;
  assertEquals([full.venue, full.event_at], [{ name: "Haku", locality: "Bandra, Mumbai" }, "2026-10-12"]);
  assertEquals(validateOutput({ ...answer, event_at: "2026-10-12T19:00:00+05:30" }, now)!.event_at, "2026-10-12T19:00:00+05:30");
  // A city alone is not somewhere to go; a venue needs both halves.
  for (const venue of [{ name: "Hyderabad", locality: "" }, { name: "", locality: "Hyderabad" }, "Haku, Bandra", null, { name: "x".repeat(81), locality: "Bandra" }]) {
    assertEquals(validateOutput({ ...answer, venue }, now)!.venue, null, JSON.stringify(venue));
  }
  // A date is a date the clock can read, and one still to come — a year gone by is history, not an event.
  for (const event of ["next friday", "12 October", "2019-01-01", "2026-09-01", 20261012, null]) {
    assertEquals(validateOutput({ ...answer, event_at: event }, now)!.event_at, null, String(event));
  }
  // The prompt asks for both, and names the day the save was made as the anchor for "this Friday".
  assertEquals(SYSTEM_PROMPT.includes("venue") && SYSTEM_PROMPT.includes("event_at") && SYSTEM_PROMPT.includes("saved on"), true);
  assertEquals(buildUserMessage(input).includes("saved on: 2026-09-15"), true);
});

Deno.test("below the confidence floor the guess is not shown: the save is filed under Other; at the floor it stands", () => {
  const answer = { tags: [], summary: "", entities: [], language: "en", actionability: "none" };
  const low = validateOutput({ ...answer, category: "Entertainment", confidence: 0.3 })!;
  assertEquals([low.category, low.confidence], ["Other", 0.3]);
  const atFloor = validateOutput({ ...answer, category: "Entertainment", confidence: UNSURE_BELOW })!;
  assertEquals(atFloor.category, "Entertainment");
  // A missing confidence is not a low one: it reads as 0.5, as before.
  assertEquals(validateOutput({ ...answer, category: "Entertainment" })!.category, "Entertainment");
});

Deno.test("the picture goes to the model with the words, and the prompt says what it is for", async () => {
  const seen: (Picture | undefined)[] = [];
  const deps: ClassifyDeps = { async call(_s, _u, _shape, picture) { seen.push(picture); return { output: { category: "Travel & places", tags: [], summary: "", entities: [], language: "en", actionability: "watch", confidence: 0.9 }, refused: false, model: "test", usage: null }; } };
  const picture: Picture = { mediaType: "image/jpeg", base64: "/9j/4AAQ" };
  await classify(input, deps, picture);
  await classify(input, deps);
  assertEquals(seen, [picture, undefined]);
  // The rule: a caption about the making or the mood is not the subject; the picture is.
  assertEquals(/picture/i.test(SYSTEM_PROMPT) && /subject/i.test(SYSTEM_PROMPT), true);
  assertEquals(PROMPT_VERSION > "2026-09-08.1", true);
});

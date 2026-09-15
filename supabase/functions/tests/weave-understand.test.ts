import { assert, assertEquals } from "jsr:@std/assert@1";
import { MAX_SAVES, PROFILE_SCHEMA, UNDERSTAND_PROMPT, understandingMessage, validateProfile, type SaveForUnderstanding } from "../_shared/weave/understand.ts";

const save = (over: Partial<SaveForUnderstanding> & { id: string }): SaveForUnderstanding => ({
  category: "Food & recipes", summary: "A café in Seongsu", tags: ["cafe"], names: ["Cafe Onion"], screenText: null, note: null, town: "Seoul", saveCount: 1, reminded: false, visited: false, ...over,
});

Deno.test("the saves go to the model as one line each, derived fields and the person's note only, bounded, the flags only when set", () => {
  const msg = understandingMessage([save({ id: "a", saveCount: 2, reminded: true, note: "go here first" }), save({ id: "b", screenText: "BEST MATCHA" })]);
  const lines = msg.split("\n");
  assertEquals(lines[0], "2 posts:");
  const a = JSON.parse(lines[1]!), b = JSON.parse(lines[2]!);
  assertEquals([a.id, a.savedTimes, a.reminded, a.note, a.visited], ["a", 2, true, "go here first", undefined]);
  assertEquals([b.screen, b.savedTimes, b.reminded], ["BEST MATCHA", undefined, undefined]);
  const many = understandingMessage(Array.from({ length: MAX_SAVES + 50 }, (_, i) => save({ id: `s${i}` })));
  assertEquals(many.split("\n").length - 1, MAX_SAVES);
});

Deno.test("the profile is made safe: only ids given, shares folded to one with empty kinds dropped, nights at least one, no repeats; nothing when there is no mix", () => {
  const known = new Set(["a", "b", "c"]);
  const p = validateProfile({
    mix: [{ kind: "food", share: 3, evidence: ["a", "zz", "a"] }, { kind: "coffee", share: 1, evidence: ["b"] }, { kind: "coffee", share: 5, evidence: [] }, { kind: "nightlife", share: 0, evidence: [] }, { kind: "cats", share: 1, evidence: [] }],
    towns: [{ name: " Seoul ", country: "kr", saves: 30, nights: 0 }, { name: "seoul", country: "KR", saves: 1, nights: 2 }, { name: "Busan", country: "Korea", saves: 4.4, nights: 1.6 }],
    must: [{ id: "a", reason: "saved twice" }, { id: "a", reason: "again" }, { id: "nope", reason: "x" }],
    style: "  hidden gems  ", group: "couple", budgetWords: " ", unsure: ["c", "a", "zz"],
  }, known)!;
  assertEquals(p.mix, [{ kind: "food", share: 0.75, evidence: ["a"] }, { kind: "coffee", share: 0.25, evidence: ["b"] }]);
  assertEquals(p.towns, [{ name: "Seoul", country: "KR", saves: 30, nights: 1 }, { name: "Busan", country: null, saves: 4, nights: 2 }]);
  assertEquals(p.must, [{ id: "a", reason: "saved twice" }]);
  assertEquals([p.style, p.group, p.budgetWords], ["hidden gems", "couple", null]);
  // A must is never unsure, whatever the model said.
  assertEquals(p.unsure, ["c"]);
  assertEquals(validateProfile({ mix: [], towns: [], must: [], style: "", group: null, budgetWords: null, unsure: [] }, known), null);
  assertEquals(validateProfile("nope", known), null);
});

Deno.test("the schema names every field the validator reads, strictly, and the prompt asks for each", () => {
  const p = validateProfile({ mix: [{ kind: "food", share: 1, evidence: [] }], towns: [], must: [], style: "", group: null, budgetWords: null, unsure: [] }, new Set())!;
  assertEquals(Object.keys(PROFILE_SCHEMA.properties).sort(), Object.keys(p).sort());
  assertEquals([...PROFILE_SCHEMA.required].sort(), Object.keys(p).sort());
  assertEquals(PROFILE_SCHEMA.additionalProperties, false);
  for (const word of ["mix", "towns", "must", "style", "group", "budgetWords", "unsure", "Never invent"]) assert(UNDERSTAND_PROMPT.includes(word), word);
});

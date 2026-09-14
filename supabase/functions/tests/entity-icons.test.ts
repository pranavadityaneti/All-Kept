import { assert, assertEquals } from "jsr:@std/assert@1";
import { ICONS_PROMPT, ICONS_SCHEMA, MAX_NAMES, runIconPass, type IconPassDeps, type IconRow } from "../_shared/entity-icons.ts";
import { ENTITY_ICONS, type EntityType } from "../_shared/contracts.ts";

const row = (item_id: string, entities: IconRow["entities"]): IconRow => ({ item_id, entities });
type Answer = { icons: { i: number; icon: string }[] };

function fake(rows: IconRow[], answer: Answer | null | (() => never), over: Partial<IconPassDeps> = {}) {
  const asked: string[] = [];
  const saved: { id: string; entities: IconRow["entities"] }[] = [];
  const logged: string[] = [];
  const deps: IconPassDeps = {
    rows: async () => rows,
    call: async (_system, user) => {
      asked.push(user);
      if (typeof answer === "function") answer();
      return answer === null
        ? { output: null, refused: false, model: "test", usage: null, error: "openai 503" }
        : { output: answer, refused: false, model: "test", usage: { input_tokens: 10, output_tokens: 5 } };
    },
    save: async (id, entities) => { saved.push({ id, entities }); },
    log: (m) => { logged.push(m); },
    ...over,
  };
  return { deps, asked, saved, logged };
}

Deno.test("every named thing without a mark is asked about once, and the answers are written onto each save that names it", async () => {
  const rows = [
    row("a", [{ type: "brand", name: "IMDb" }, { type: "tool", name: "Claude" }]),
    row("b", [{ type: "brand", name: "imdb" }, { type: "person", name: "Julian Goldie", icon: "person-circle" }]),
  ];
  const f = fake(rows, { icons: [{ i: 0, icon: "film" }, { i: 1, icon: "chatbubbles" }] });
  const r = await runIconPass(f.deps);
  // Two distinct names lacking a mark: "IMDb"/"imdb" are one, and the person already has one.
  assertEquals(f.asked.length, 1);
  assertEquals(JSON.parse(f.asked[0]!), [{ i: 0, name: "IMDb", type: "brand" }, { i: 1, name: "Claude", type: "tool" }]);
  assertEquals(f.saved, [
    { id: "a", entities: [{ type: "brand", name: "IMDb", icon: "film" }, { type: "tool", name: "Claude", icon: "chatbubbles" }] },
    { id: "b", entities: [{ type: "brand", name: "imdb", icon: "film" }, { type: "person", name: "Julian Goldie", icon: "person-circle" }] },
  ]);
  assertEquals(r, { rows: 2, names: 2, saved: 2 });
});

Deno.test("a name the model left out, or answered with something not in the vocabulary, wears its kind's own mark and is not asked again", async () => {
  const rows = [row("a", [{ type: "brand", name: "Uber" }, { type: "place", name: "Lisbon" }, { type: "recipe", name: "Dal" }, { type: "galaxy" as EntityType, name: "Andromeda" }])];
  const f = fake(rows, { icons: [{ i: 1, icon: "airplane" }, { i: 2, icon: "not-a-glyph" }, { i: 9, icon: "film" }] });
  await runIconPass(f.deps);
  assertEquals(f.saved[0]!.entities.map((e) => e.icon), ["pricetag", "airplane", "restaurant", "sparkles"]);
});

Deno.test("when the model cannot be reached nothing is written, so the same saves are asked about next time", async () => {
  const f = fake([row("a", [{ type: "brand", name: "Uber" }])], null);
  const r = await runIconPass(f.deps);
  assertEquals(f.saved, []);
  assertEquals(r, { rows: 1, names: 1, saved: 0 });
  assert(f.logged.some((m) => m.includes("icon pass")));
});

Deno.test("a blank name on a save is nothing to mark, and never holds the save back", async () => {
  const f = fake([row("a", [{ type: "brand", name: "Uber" }, { type: "other", name: "  " }])], { icons: [{ i: 0, icon: "car" }] });
  assertEquals(await runIconPass(f.deps), { rows: 1, names: 1, saved: 1 });
  assertEquals(JSON.parse(f.asked[0]!).length, 1);
  assertEquals(f.saved[0]!.entities, [{ type: "brand", name: "Uber", icon: "car" }, { type: "other", name: "  " }]);
});

Deno.test("nothing to do costs no model call", async () => {
  const done = fake([row("a", [{ type: "brand", name: "Uber", icon: "car" }])], { icons: [] });
  assertEquals(await runIconPass(done.deps), { rows: 1, names: 0, saved: 0 });
  assertEquals(done.asked.length, 0);
  const empty = fake([], { icons: [] });
  assertEquals(await runIconPass(empty.deps), { rows: 0, names: 0, saved: 0 });
  assertEquals(empty.asked.length, 0);
});

Deno.test("a run asks about a bounded number of names; the rest wait for the next sweep, and a save is only written once every name on it is answered", async () => {
  const many = Array.from({ length: MAX_NAMES + 5 }, (_, i) => ({ type: "brand" as const, name: `Brand ${i}` }));
  const rows = [row("first", many.slice(0, 3)), row("second", many.slice(3))];
  const f = fake(rows, { icons: Array.from({ length: MAX_NAMES }, (_, i) => ({ i, icon: "cart" })) });
  const r = await runIconPass(f.deps);
  assertEquals(JSON.parse(f.asked[0]!).length, MAX_NAMES);
  assertEquals(f.saved.map((s) => s.id), ["first"]);
  assertEquals(r, { rows: 2, names: MAX_NAMES, saved: 1 });
});

Deno.test("the prompt lists the whole vocabulary and the schema allows nothing outside it", () => {
  for (const icon of ENTITY_ICONS) assert(ICONS_PROMPT.includes(`"${icon}"`), icon);
  assertEquals(ICONS_SCHEMA.properties.icons.items.properties.icon.enum, [...ENTITY_ICONS]);
});

import { assertEquals } from "jsr:@std/assert@1";
import { describeVideo, runDescriptionPass } from "../_shared/youtube-descriptions.ts";

Deno.test("the pass asks once per save, writes what came back, records an empty answer, and never lets one row fail the rest", async () => {
  const saved: [string, string | null][] = [];
  const out = await runDescriptionPass({
    rows: async (limit) => [{ itemId: "a", videoId: "v1" }, { itemId: "b", videoId: "v2" }, { itemId: "c", videoId: "v3" }].slice(0, limit),
    describe: async (id) => (id === "v1" ? "Nine coffee shops in Tokyo" : null),
    save: async (itemId, description) => { if (itemId === "c") throw new Error("db down"); saved.push([itemId, description]); },
    log: () => {},
  }, 10);
  assertEquals(saved, [["a", "Nine coffee shops in Tokyo"], ["b", null]]);
  assertEquals(out, { rows: 3, described: 1, empty: 1, failed: 1 });
});

Deno.test("the Data API is asked for the snippet alone, and a refusal or an outage is no description", async () => {
  const seen: string[] = [];
  const ok = (async (input: string | URL | Request) => { seen.push(String(input)); return Response.json({ items: [{ snippet: { description: " Glitch Coffee, Jimbocho " } }] }); }) as typeof fetch;
  assertEquals(await describeVideo("abc", "KEY", ok), "Glitch Coffee, Jimbocho");
  assertEquals(seen[0]!.includes("part=snippet") && seen[0]!.includes("id=abc") && seen[0]!.includes("key=KEY"), true);
  assertEquals(await describeVideo("abc", "KEY", (async () => new Response("quota", { status: 403 })) as typeof fetch), null);
  assertEquals(await describeVideo("abc", "KEY", (async () => { throw new Error("down"); }) as typeof fetch), null);
});

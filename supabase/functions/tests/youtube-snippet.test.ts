import { assertEquals } from "jsr:@std/assert@1";
import { readSnippet, runSnippetPass } from "../_shared/youtube-snippet.ts";

Deno.test("the pass hands each save what YouTube said, counts what the save took, leaves a save YouTube did not answer for to be asked again, and never lets one row fail the rest", async () => {
  const saved: string[] = [];
  const out = await runSnippetPass({
    rows: async (limit) => [{ itemId: "a", videoId: "v1" }, { itemId: "b", videoId: "v2" }, { itemId: "c", videoId: "v3" }, { itemId: "d", videoId: "v4" }].slice(0, limit),
    read: async (id) => (id === "v1" ? { description: "Nine coffee shops in Tokyo", picture: "https://i.ytimg.com/vi/v1/maxresdefault.jpg" } : id === "v2" ? { description: null, picture: null } : id === "v3" ? { description: "words", picture: null } : null),
    save: async (itemId, snippet) => {
      if (itemId === "c") throw new Error("db down");
      saved.push(itemId);
      return { text: !!snippet.description, picture: !!snippet.picture };
    },
    log: () => {},
  }, 10);
  assertEquals(saved, ["a", "b"], "a save YouTube did not answer for is not marked asked");
  assertEquals(out, { rows: 4, texts: 1, pictures: 1, empty: 1, unanswered: 1, failed: 1, left: 0 });
});

Deno.test("the pass stops taking rows once its time is spent, and the rows not reached are left unmarked for the next sweep", async () => {
  let asked = 0;
  const out = await runSnippetPass({
    rows: async () => [{ itemId: "a", videoId: "v1" }, { itemId: "b", videoId: "v2" }],
    read: async () => { asked++; return { description: "words", picture: null }; },
    save: async () => ({ text: true, picture: false }),
    log: () => {},
  }, 10, Date.now() - 1);
  assertEquals(asked, 0);
  assertEquals(out, { rows: 2, texts: 0, pictures: 0, empty: 0, unanswered: 0, failed: 0, left: 2 });
});

Deno.test("the Data API is asked for the snippet alone; a video that is gone is an empty answer, and a refusal or an outage is no answer at all", async () => {
  const seen: string[] = [];
  const ok = (async (input: string | URL | Request) => { seen.push(String(input)); return Response.json({ items: [{ snippet: { description: " Glitch Coffee, Jimbocho ", thumbnails: { high: { url: "https://i.ytimg.com/vi/abc/hqdefault.jpg" }, maxres: { url: "https://i.ytimg.com/vi/abc/maxresdefault.jpg" } } } }] }); }) as typeof fetch;
  assertEquals(await readSnippet("abc", "KEY", ok), { description: "Glitch Coffee, Jimbocho", picture: "https://i.ytimg.com/vi/abc/maxresdefault.jpg" });
  assertEquals(seen[0]!.includes("part=snippet") && seen[0]!.includes("id=abc") && seen[0]!.includes("key=KEY"), true);
  assertEquals(await readSnippet("abc", "KEY", (async () => Response.json({ items: [] })) as typeof fetch), { description: null, picture: null });
  assertEquals(await readSnippet("abc", "KEY", (async () => new Response("quota", { status: 403 })) as typeof fetch), null);
  assertEquals(await readSnippet("abc", "KEY", (async () => { throw new Error("down"); }) as typeof fetch), null);
});

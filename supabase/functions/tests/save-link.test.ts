import { assertEquals } from "jsr:@std/assert@1";
import { handleSaveLink, type SaveLinkDeps } from "../save-link/handler.ts";
import type { CaptureInput } from "../_shared/contracts.ts";
const URL = "https://www.instagram.com/p/Original/";
const req = (body: unknown) => new Request("https://example.test/save-link", { method: "POST", body: JSON.stringify(body) });
function fake(userId: string | null = "owner") {
  const captured: CaptureInput[] = [];
  const queued: string[] = [];
  const deps: SaveLinkDeps = {
    userId: async () => userId,
    capture: async (input) => { captured.push(input); return { itemId: "item", deduplicated: false, status: "pending", platform: "instagram", kind: "post" }; },
    enqueue: (id) => { queued.push(id); },
  };
  return { deps, captured, queued };
}
Deno.test("direct saves use the authenticated owner and retain the URL before enrichment", async () => {
  const f = fake();
  const res = await handleSaveLink(req({ text: URL + "?igsh=x", requestId: "request-123", userId: "someone-else" }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(f.captured[0]!.userId, "owner");
  assertEquals(f.captured[0]!.sourceId, null);
  assertEquals(f.captured[0]!.sourceKind, "share");
  assertEquals(f.captured[0]!.sourceEventId, "request-123");
  assertEquals(f.captured[0]!.sharedUrl, URL);
  assertEquals(f.queued, ["item"]);
});
Deno.test("direct saves reject unauthenticated requests and text with no link in it", async () => {
  const unauthed = fake(null);
  assertEquals((await handleSaveLink(req({ text: URL, requestId: "request-123" }), unauthed.deps)).status, 401);
  assertEquals(unauthed.captured.length, 0);
  // Only the absence of a link is a refusal now. A profile, a page on a site we have never heard
  // of, even a bare image address, are all links someone may legitimately want kept.
  for (const text of ["hello", "nothing here but words", "", "a".repeat(20001)]) {
    const f = fake();
    assertEquals((await handleSaveLink(req({ text, requestId: "request-123" }), f.deps)).status, 400);
    assertEquals(f.captured.length, 0);
  }
});
Deno.test("any link is a save, not only an Instagram one", async () => {
  for (const [text, host] of [
    ["https://www.theverge.com/2026/9/8/meta-muse-agent", "theverge.com"],
    ["github.com/expo/expo", "github.com"],                                  // scheme left off, as a copied address often is
    ["Worth reading https://en.wikipedia.org/wiki/Bookmark", "en.wikipedia.org"], // a link with words around it
    ["https://www.instagram.com/person/", "instagram.com"],                    // a profile is a link too
  ] as const) {
    const f = fake();
    assertEquals((await handleSaveLink(req({ text, requestId: "request-123" }), f.deps)).status, 200);
    // `URL` is a string constant in this file, so the constructor needs naming explicitly.
    assertEquals(new globalThis.URL(f.captured[0]!.sharedUrl!).hostname.replace(/^www\./, ""), host);
  }
});
Deno.test("a scheme-less pasted permalink is captured as a URL rather than a note", async () => {
  const f = fake();
  assertEquals((await handleSaveLink(req({ text: "instagram.com/p/Original/", requestId: "request-123" }), f.deps)).status, 200);
  assertEquals(f.captured[0]!.sharedUrl, URL);
});
Deno.test("Instagram redirect shares retain their original address", async () => {
  const f = fake();
  const url = "https://www.instagram.com/share/ABC123/";
  assertEquals((await handleSaveLink(req({ text: url, requestId: "request-123" }), f.deps)).status, 200);
  assertEquals(f.captured[0]!.sharedUrl, url);
});

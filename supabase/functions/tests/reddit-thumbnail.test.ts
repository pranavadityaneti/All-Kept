import { assertEquals } from "jsr:@std/assert@1";
import { handleRedditThumbnail, isPictureHost, isRedditImageHost, type RedditThumbnailDeps } from "../reddit-thumbnail/handler.ts";

const ITEM = "6d03f7aa-1234-4abc-8def-0123456789ab";
const PICTURE = "https://external-preview.redd.it/abc.png?width=640&crop=smart&s=sig";
const req = (body: unknown) => new Request("https://example.test/reddit-thumbnail", { method: "POST", body: JSON.stringify(body) });

function fake(over: Partial<RedditThumbnailDeps> = {}) {
  const stored: { itemId: string; url: string }[] = [];
  const deps: RedditThumbnailDeps = {
    userId: async () => "owner",
    async platformOfItemNeedingPicture(itemId, userId) { return itemId === ITEM && userId === "owner" ? "reddit" : null; },
    async storeRemoteThumbnail(itemId, url) { stored.push({ itemId, url }); },
    ...over,
  };
  return { deps, stored };
}

Deno.test("a Reddit image host is accepted; anywhere else the server must not be sent is not", () => {
  for (const ok of ["https://external-preview.redd.it/a.png", "https://preview.redd.it/a.jpg", "https://i.redd.it/a.jpg", "https://b.thumbs.redditmedia.com/a.jpg"]) {
    assertEquals(isRedditImageHost(ok), true, ok);
  }
  for (const no of [
    "https://evil.example.com/a.jpg",
    "http://preview.redd.it/a.jpg",                      // plain http
    "https://preview.redd.it.evil.com/a.jpg",            // suffix trick
    "https://127.0.0.1/a.jpg",
    "https://www.reddit.com/r/x/comments/y/",            // not an image host
    "not a url",
  ]) assertEquals(isRedditImageHost(no), false, no);
});

Deno.test("the picture is stored for an item the caller owns", async () => {
  const f = fake();
  const res = await handleRedditThumbnail(req({ itemId: ITEM, imageUrl: PICTURE }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(f.stored, [{ itemId: ITEM, url: PICTURE }]);
});

Deno.test("nothing is stored for a signed-out caller, a bad id, a foreign host, or an item that is not the caller's", async () => {
  const out = fake({ userId: async () => null });
  assertEquals((await handleRedditThumbnail(req({ itemId: ITEM, imageUrl: PICTURE }), out.deps)).status, 401);
  assertEquals(out.stored.length, 0);

  const f = fake();
  assertEquals((await handleRedditThumbnail(req({ itemId: "nope", imageUrl: PICTURE }), f.deps)).status, 400);
  assertEquals((await handleRedditThumbnail(req({ itemId: ITEM, imageUrl: "https://evil.example.com/a.jpg" }), f.deps)).status, 400);
  assertEquals(f.stored.length, 0);

  const other = fake({ platformOfItemNeedingPicture: async () => null });
  assertEquals((await handleRedditThumbnail(req({ itemId: ITEM, imageUrl: PICTURE }), other.deps)).status, 404);
  assertEquals(other.stored.length, 0);
});

Deno.test("only POST is answered", async () => {
  const f = fake();
  assertEquals((await handleRedditThumbnail(new Request("https://example.test/x", { method: "GET" }), f.deps)).status, 400);
});

Deno.test("a TikTok picture host is accepted for a TikTok save, and nowhere else is", () => {
  for (const ok of [
    "https://p19-common-sign.tiktokcdn-us.com/tos-useast5-i-photomode-tx/abc~tplv-photo.jpeg",
    "https://p16-sign-va.tiktokcdn.com/obj/abc",
    "https://tiktokcdn.com/abc.jpg",
  ]) assertEquals(isPictureHost(ok, "tiktok"), true, ok);

  for (const no of [
    "https://tiktokcdn-us.com.evil.com/a.jpg",   // suffix trick
    "https://eviltiktokcdn.com/a.jpg",           // not a subdomain boundary
    "http://p16-sign-va.tiktokcdn.com/a.jpg",    // plain http
    "https://preview.redd.it/a.jpg",             // right shape, wrong platform
    "https://127.0.0.1/a.jpg",
  ]) assertEquals(isPictureHost(no, "tiktok"), false, no);
});

Deno.test("each platform may only name its own picture hosts", () => {
  assertEquals(isPictureHost("https://preview.redd.it/a.jpg", "reddit"), true);
  assertEquals(isPictureHost("https://p16-sign-va.tiktokcdn.com/a.jpg", "reddit"), false);
  assertEquals(isPictureHost("https://preview.redd.it/a.jpg", "instagram"), false);
});

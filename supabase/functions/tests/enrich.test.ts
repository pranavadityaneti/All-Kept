import { assert, assertEquals } from "jsr:@std/assert@1";
import { enrich, parseOpenGraph, RETRY_LADDER_MS, type EnrichableItem, type EnrichDeps } from "../_shared/enrich.ts";

const base = (over: Partial<EnrichableItem> = {}): EnrichableItem => ({
  id: "item-1", user_id: "u1", platform: "instagram", kind: "short_video", status: "pending",
  source_url: "https://www.instagram.com/reel/DcVMQIIMa5-/", canonical_url: "https://www.instagram.com/reel/DcVMQIIMa5-/", external_id: "DcVMQIIMa5-",
  needs_expansion: false, title: null, text: "Travis Kalanick on the little details", author_name: null, thumbnail_url_remote: null, thumbnail_path: null, enrich_attempts: 0, ...over,
});
const fakeFetch = (routes: Record<string, () => Response>, seen: string[] = []): typeof fetch => (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  seen.push(url);
  for (const [prefix, make] of Object.entries(routes)) if (url.startsWith(prefix)) return make();
  return new Response("not found", { status: 404 });
}) as typeof fetch;
const deps = (fetchImpl: typeof fetch, snaps: string[] = []): EnrichDeps => ({ fetch: fetchImpl, async snapshot(_u, id, url) { snaps.push(url); return `u1/${id}.jpg`; }, log() {} });

Deno.test("instagram reel: oEmbed gives author and thumbnail, caption stays, thumbnail snapshotted", async () => {
  const seen: string[] = []; const snaps: string[] = [];
  const f = fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": () => Response.json({ author_name: "davidsenra", thumbnail_url: "https://cdn/thumb.jpg", provider_name: "Instagram", type: "rich" }) }, seen);
  const r = await enrich(base(), deps(f, snaps));
  assertEquals(r.status, "ready");
  assertEquals(r.patch.author_name, "davidsenra");
  assertEquals(r.patch.thumbnail_url_remote, "https://cdn/thumb.jpg");
  assertEquals(r.patch.thumbnail_path, "u1/item-1.jpg");
  assertEquals(r.patch.text, undefined); // existing caption kept
  assert(seen[0]!.includes("omitscript=true"));
});

Deno.test("a private or deleted post is preview_unavailable, kept, not retried", async () => {
  const r = await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com": () => new Response("{}", { status: 400 }) })));
  assertEquals(r.status, "preview_unavailable");
  assertEquals(r.retryAfterMs, undefined);
});

Deno.test("rate limits and server errors schedule a retry along the ladder", async () => {
  const r0 = await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com": () => new Response("", { status: 429 }) })));
  assertEquals([r0.status, r0.retryAfterMs], ["failed", RETRY_LADDER_MS[0]]);
  const r4 = await enrich(base({ enrich_attempts: 4 }), deps(fakeFetch({ "https://graph.facebook.com": () => new Response("", { status: 503 }) })));
  assertEquals(r4.retryAfterMs, RETRY_LADDER_MS[4]);
  const r5 = await enrich(base({ enrich_attempts: 5 }), deps(fakeFetch({ "https://graph.facebook.com": () => new Response("", { status: 503 }) })));
  assertEquals(r5.retryAfterMs, 0);
});

Deno.test("youtube: oEmbed title and author become the card", async () => {
  const r = await enrich(base({ platform: "youtube", kind: "video", canonical_url: "https://www.youtube.com/watch?v=WfJPBVXPt8k", text: null }),
    deps(fakeFetch({ "https://www.youtube.com/oembed": () => Response.json({ title: "How Uber beat Lyft", author_name: "David Senra", thumbnail_url: "https://i.ytimg.com/x.jpg" }) })));
  assertEquals([r.status, r.patch.title, r.patch.author_name], ["ready", "How Uber beat Lyft", "David Senra"]);
});

Deno.test("web page: Open Graph tags are parsed; a page without any is preview_unavailable", async () => {
  const html = `<html><head><title>Fallback</title><meta property="og:title" content="Ten &amp; more" /><meta content="A description" property="og:description"><meta property="og:image" content="https://site/img.png"><meta property="og:site_name" content="Site"></head></html>`;
  const og = parseOpenGraph(html);
  assertEquals([og.title, og.description, og.image, og.siteName], ["Ten & more", "A description", "https://site/img.png", "Site"]);
  const r = await enrich(base({ platform: "web", kind: "article", canonical_url: "https://site/page", text: null }), deps(fakeFetch({ "https://site/page": () => new Response(html, { headers: { "content-type": "text/html" } }) })));
  assertEquals([r.status, r.patch.title, r.patch.text, r.patch.thumbnail_url_remote], ["ready", "Ten & more", "A description", "https://site/img.png"]);
  const empty = await enrich(base({ platform: "web", kind: "article", canonical_url: "https://site/blank", text: null }), deps(fakeFetch({ "https://site/blank": () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) })));
  assertEquals(empty.status, "preview_unavailable");
});

Deno.test("short links are expanded and re-normalised before metadata", async () => {
  const seen: string[] = [];
  const f = fakeFetch({
    "https://t.co/AbC": () => Object.defineProperty(new Response("", { status: 200 }), "url", { value: "https://x.com/naval/status/1002103360646823936?s=20" }),
    "https://publish.twitter.com/oembed": () => Response.json({ author_name: "Naval", html: "<blockquote><p>Seek wealth, not money</p></blockquote>" }),
  }, seen);
  const r = await enrich(base({ platform: "x", kind: "post", source_url: "https://t.co/AbC", canonical_url: null, external_id: null, needs_expansion: true, text: null }), deps(f));
  assertEquals(r.patch.canonical_url, "https://x.com/naval/status/1002103360646823936");
  assertEquals(r.patch.external_id, "1002103360646823936");
  assertEquals(r.patch.needs_expansion, false);
  assertEquals(r.patch.text, "Seek wealth, not money");
  assertEquals(r.status, "ready");
});

Deno.test("no-link posts fetch nothing, keep their status, and snapshot the expiring image", async () => {
  const seen: string[] = []; const snaps: string[] = [];
  const r = await enrich(base({ status: "no_link", kind: "post", canonical_url: null, external_id: "igpost:1", thumbnail_url_remote: "https://lookaside.fbsbx.com/x" }), deps(fakeFetch({}, seen), snaps));
  assertEquals([r.status, seen.length, snaps], ["no_link", 0, ["https://lookaside.fbsbx.com/x"]]);
});

Deno.test("notes are simply ready", async () => {
  const r = await enrich(base({ platform: "note", kind: "text", canonical_url: null, source_url: null, external_id: "abc", text: "buy the lamp" }), deps(fakeFetch({})));
  assertEquals(r.status, "ready");
});

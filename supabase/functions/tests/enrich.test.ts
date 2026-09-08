import { assert, assertEquals } from "jsr:@std/assert@1";
import { decodeEntities, enrich, parseInstagramOpenGraph, parseOpenGraph, readHead, RETRY_LADDER_MS, type EnrichableItem, type EnrichDeps } from "../_shared/enrich.ts";

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

Deno.test("instagram tokenless oEmbed (html only): author is parsed from the embed markup", async () => {
  const html = '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DcVMQIIMa5-/"><div><a href="https://www.instagram.com/reel/DcVMQIIMa5-/">A post shared by David Senra (@davidsenra)</a></div></blockquote>';
  const r = await enrich(base({ text: null }), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": () => Response.json({ version: "1.0", provider_name: "Instagram", type: "rich", width: 658, html }) })));
  assertEquals([r.status, r.patch.author_name, r.patch.author_handle, r.patch.thumbnail_url_remote], ["ready", "David Senra", "davidsenra", undefined]);
});

// Shape of Instagram's real reel page tags on 8 Sep 2026 (entities and signed CDN url as served).
const IG_PAGE = `<html><head><title>Instagram</title>
<meta property="og:title" content="David Senra on Instagram: &quot;Travis Kalanick on the little details that helped Uber beat Lyft: &#x201c;I needed to subsidize rides&#x201d;&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.82787-15/784075060_n.jpg?stp=cmp1_dst-jpg_e35_s640x640&amp;_nc_ht=x" />
<meta property="og:description" content="5,115 likes, 78 comments - davidsenra on August 21, 2026: &quot;Travis Kalanick on the little details&quot;" />
<meta name="twitter:title" content="David Senra (&#064;davidsenra) &#x2022; Instagram reel" />
</head></html>`;
const TOKENLESS_OEMBED = () => Response.json({ version: "1.0", provider_name: "Instagram", provider_url: "https://www.instagram.com/", type: "rich", width: 658, html: '<blockquote class="instagram-media"><a href="https://www.instagram.com/reel/DcVMQIIMa5-/">View this post on Instagram</a></blockquote>' });

Deno.test("instagram tokenless oEmbed: author, handle and thumbnail come from the permalink's link-preview tags", async () => {
  const snaps: string[] = [];
  const r = await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response(IG_PAGE, { headers: { "content-type": "text/html" } }) }), snaps));
  assertEquals([r.status, r.patch.author_name, r.patch.author_handle], ["ready", "David Senra", "davidsenra"]);
  assertEquals(r.patch.thumbnail_url_remote, "https://scontent.cdninstagram.com/v/t51.82787-15/784075060_n.jpg?stp=cmp1_dst-jpg_e35_s640x640&_nc_ht=x");
  assertEquals(snaps, [r.patch.thumbnail_url_remote]);
  assertEquals(r.patch.text, undefined); // the caption Meta sent with the DM stays
  assertEquals((r.patch.media_meta as Record<string, unknown>)["link_preview"], true);
});

Deno.test("instagram tokenless oEmbed: the caption is taken from the page only when the item has none", async () => {
  const r = await enrich(base({ text: null }), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response(IG_PAGE) })));
  assertEquals(r.patch.text, "Travis Kalanick on the little details that helped Uber beat Lyft: \u201cI needed to subsidize rides\u201d");
});

Deno.test("instagram: a failing link-preview fetch leaves the item ready with what oEmbed gave", async () => {
  const logged: string[] = [];
  const d = deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response("", { status: 429 }) }));
  d.log = (m) => { logged.push(m); };
  const r = await enrich(base(), d);
  assertEquals([r.status, r.patch.author_name, r.patch.thumbnail_url_remote, r.retryAfterMs], ["ready", undefined, undefined, undefined]);
  assertEquals(logged, ["enrich: link-preview fallback unavailable"]);
});

Deno.test("oEmbed that already names the author and thumbnail never touches the page", async () => {
  const seen: string[] = [];
  await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": () => Response.json({ author_name: "davidsenra", thumbnail_url: "https://cdn/t.jpg" }) }, seen)));
  assertEquals(seen.length, 1);
});

Deno.test("parseInstagramOpenGraph reads name, handle and caption from the page tags", () => {
  assertEquals(parseInstagramOpenGraph(IG_PAGE), { authorName: "David Senra", authorHandle: "davidsenra", caption: "Travis Kalanick on the little details that helped Uber beat Lyft: \u201cI needed to subsidize rides\u201d" });
  const noTwitter = IG_PAGE.replace(/<meta name="twitter:title"[^>]*>/, "");
  assertEquals(parseInstagramOpenGraph(noTwitter).authorHandle, "davidsenra"); // from og:description
  assertEquals(parseInstagramOpenGraph("<html></html>"), {});
});

Deno.test("decodeEntities handles named, decimal and hex entities and leaves invalid ones alone", () => {
  assertEquals(decodeEntities("a &amp; b &#064; &#x2022; &quot;q&quot; &apos;s&apos; &nbsp;"), "a & b @ \u2022 \"q\" 's'  ");
  assertEquals(decodeEntities("&#xD800; &#0; &bogus; &#99999999;"), "&#xD800; &#0; &bogus; &#99999999;");
  assertEquals(decodeEntities("&#128512;"), "\u{1F600}");
});

Deno.test("parseOpenGraph keeps apostrophes inside double-quoted content and reads single-quoted content", () => {
  const og = parseOpenGraph(`<meta property="og:title" content="Don't stop" /><meta property='og:description' content='He said "hi"' />`);
  assertEquals([og.title, og.description], ["Don't stop", 'He said "hi"']);
});

Deno.test("instagram: a page without link-preview tags (login wall) is logged and adds nothing", async () => {
  const logged: string[] = [];
  const d = deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response("<html><head><title>Login</title></head></html>") }));
  d.log = (m) => { logged.push(m); };
  const r = await enrich(base(), d);
  assertEquals([r.status, r.patch.author_name, (r.patch.media_meta as Record<string, unknown>)["link_preview"]], ["ready", undefined, undefined]);
  assertEquals(logged, ["enrich: link-preview tags absent"]);
});

Deno.test("a failed snapshot is recorded on the item for the sweeper to retry, and the card stays ready", async () => {
  const logged: string[] = [];
  const d = deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response(IG_PAGE) }));
  d.snapshot = async () => { throw new Error("too large: 2113627 bytes"); };
  d.log = (m) => { logged.push(m); };
  const r = await enrich(base(), d);
  assertEquals([r.status, r.patch.thumbnail_path, r.patch.author_name], ["ready", undefined, "David Senra"]);
  assertEquals((r.patch.media_meta as Record<string, unknown>)["snapshot_error"], "too large: 2113627 bytes");
  assertEquals(logged, ["enrich: snapshot failed"]);
});

/** A page whose head carries the tags, followed by a body that must never be pulled. */
const hugePage = (head: string) => {
  let pulls = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (pulls === 1) { controller.enqueue(new TextEncoder().encode(head + "<!-- " + "x".repeat(300_000) + " -->")); return; }
      throw new Error("the rest of the page was read");
    },
  });
};

Deno.test("readHead stops after the byte cap and closes the stream; a cut multibyte character is replaced, not thrown", async () => {
  const text = await readHead(new Response(hugePage("<meta property=\"og:title\" content=\"Head\">")), 1_000);
  assertEquals(text.length, 1_000);
  assert(text.startsWith("<meta property=\"og:title\" content=\"Head\">"));
  const cut = await readHead(new Response(new TextEncoder().encode("ab\u{1F600}")), 3);
  assertEquals([cut.length, cut.startsWith("ab")], [3, true]);
  assertEquals(await readHead(new Response(null), 10), "");
});

Deno.test("instagram: the link-preview fallback reads only the head of a 650 KB page", async () => {
  const r = await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": TOKENLESS_OEMBED, "https://www.instagram.com/reel/DcVMQIIMa5-/": () => new Response(hugePage(IG_PAGE)) })));
  assertEquals([r.status, r.patch.author_name, r.patch.author_handle], ["ready", "David Senra", "davidsenra"]);
});

Deno.test("web page: Open Graph reading is capped the same way", async () => {
  const html = `<meta property="og:title" content="Capped" /><meta property="og:description" content="Still parsed" />`;
  const r = await enrich(base({ platform: "web", kind: "article", canonical_url: "https://site/huge", text: null }), deps(fakeFetch({ "https://site/huge": () => new Response(hugePage(html), { headers: { "content-type": "text/html" } }) })));
  assertEquals([r.status, r.patch.title, r.patch.text], ["ready", "Capped", "Still parsed"]);
});

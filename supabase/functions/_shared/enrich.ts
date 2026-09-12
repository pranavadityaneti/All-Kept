// Enrichment: turn a stored item into a card (title, text, author, thumbnail) using public metadata only. Pure; fetch injected.
import { normalize } from "./normalize.ts";
import type { Kind, Platform } from "./normalize.ts";
import type { ItemStatus } from "./contracts.ts";

export interface EnrichableItem {
  id: string;
  user_id: string;
  platform: Platform;
  kind: Kind;
  status: ItemStatus;
  source_url: string | null;
  canonical_url: string | null;
  external_id: string | null;
  needs_expansion: boolean;
  title: string | null;
  text: string | null;
  author_name: string | null;
  thumbnail_url_remote: string | null;
  thumbnail_path: string | null;
  enrich_attempts: number;
}

export interface EnrichPatch {
  platform?: Platform; kind?: Kind; source_url?: string; canonical_url?: string | null; external_id?: string | null; needs_expansion?: boolean;
  title?: string; text?: string; author_name?: string; author_handle?: string; thumbnail_url_remote?: string; thumbnail_path?: string;
  media_meta?: Record<string, unknown>;
}

export interface EnrichResult {
  status: ItemStatus;
  patch: EnrichPatch;
  /** Set when the fetch failed in a retryable way (429, 5xx, network). */
  retryAfterMs?: number;
  error?: string;
}

export interface EnrichDeps {
  fetch: typeof fetch;
  /** Stores the image at `url` as the item's thumbnail and returns the storage path; throws with a short reason when nothing was stored. */
  snapshot(userId: string, itemId: string, url: string): Promise<string | null>;
  /** Absent until YOUTUBE_API_KEY is configured, in which case a video's shape simply is not learned. */
  youtubeKey?: string;
  log(message: string, meta?: Record<string, unknown>): void;
}

const TIMEOUT_MS = 8_000;
/** Link-preview tags live in <head>; Instagram's sit within the first 15 KB of a 650 KB page. Reading stops here and the connection is closed. */
const MAX_HTML_BYTES = 256_000;
export const RETRY_LADDER_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
export const UA = "Mozilla/5.0 (compatible; AllkeptBot/0.1; +https://allkept.app)";
/**
 * The expansion hop only. Following a shortener's redirect is not scraping, but shorteners sit behind
 * bot walls that answer a bot string with a "Please wait…" page (HTTP 200) and send it to the front
 * door — TikTok's vm.tiktok.com did exactly that. Every metadata fetch keeps the honest UA above.
 */
export const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/**
 * Asking YouTube for a player this tall makes it answer with the video's own proportions rather than
 * a default box, which is the only way to learn the shape of a video. See `parseAspect`.
 */
const ASPECT_PROBE_PX = 8192;

/**
 * The true shape of a YouTube video, as width ÷ height, or null when YouTube will not say.
 *
 * Nothing else in the pipeline knows it. A Short saved from a playlist arrives as an ordinary
 * `watch?v=` link, so its kind is `video` like everything else, and YouTube's oEmbed answers a flat
 * 200x113 for a Short and a widescreen video alike — both were checked against real saves. Only the
 * Data API distinguishes them. Without this the app has to guess, and it guesses 16:9, which is what
 * put vertical videos inside black bars.
 */
/** A saved YouTube link that is a playlist rather than a video. Their ids and their APIs differ. */
export const playlistId = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(url);
  return m && !/[?&]v=[A-Za-z0-9_-]/.test(url) ? m[1]! : null;
};

/**
 * What YouTube says about a playlist.
 *
 * Their oEmbed answers "Unauthorized" for a playlist — it serves videos only — so a saved playlist
 * arrived with no title, no picture and no text at all. The playlist page does carry preview tags,
 * but reading it means scraping past whatever YouTube serves a datacentre, and we already hold a key
 * that answers the question properly. This is the same call the register door makes.
 */
export function parsePlaylist(body: unknown): { title: string; channel: string | null; thumbnail: string | null; embeddable: boolean } | null {
  const snippet = (body as { items?: { snippet?: Record<string, unknown>; status?: { privacyStatus?: unknown } }[] } | null)?.items?.[0]?.snippet;
  const privacy = (body as { items?: { status?: { privacyStatus?: unknown } }[] } | null)?.items?.[0]?.status?.privacyStatus;
  if (!snippet) return null;
  const title = typeof snippet["title"] === "string" ? (snippet["title"] as string).trim() : "";
  if (!title) return null;
  const thumbs = snippet["thumbnails"] as Record<string, { url?: string }> | undefined;
  // Widest first: the card wants the best it can get, and not every playlist has every size.
  const thumbnail = ["maxres", "standard", "high", "medium", "default"]
    .map((k) => thumbs?.[k]?.url).find((u): u is string => typeof u === "string" && !!u) ?? null;
  const channel = typeof snippet["channelTitle"] === "string" ? (snippet["channelTitle"] as string).trim() || null : null;
  // Only a public playlist plays in an embedded player. An unlisted one answers "This video is
  // unavailable" inside the frame, however the embed address is written — so the app is told not to
  // try, and shows the card and a way out to YouTube instead of a black box.
  return { title, channel, thumbnail, embeddable: privacy === "public" };
}

export function parseAspect(body: unknown): number | null {
  const player = (body as { items?: { player?: { embedWidth?: unknown; embedHeight?: unknown } }[] } | null)?.items?.[0]?.player;
  // YouTube sends both as strings.
  const w = Number(player?.embedWidth);
  const h = Number(player?.embedHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return Math.round((w / h) * 1000) / 1000;
}

function oembedUrl(platform: Platform, url: string): string | null {
  const u = encodeURIComponent(url);
  switch (platform) {
    case "instagram": return `https://graph.facebook.com/v23.0/instagram_oembed?url=${u}&omitscript=true`;
    case "facebook": return `https://graph.facebook.com/v23.0/oembed_post?url=${u}&omitscript=true`;
    case "threads": return `https://graph.threads.net/oembed?url=${u}`;
    case "youtube": return `https://www.youtube.com/oembed?url=${u}&format=json`;
    case "x": return `https://publish.twitter.com/oembed?url=${u}&omit_script=true`;
    case "tiktok": return `https://www.tiktok.com/oembed?url=${u}`;
    // Reddit serves an interstitial rather than preview tags to anything that is not a browser, so
    // the page itself yields nothing. Their oEmbed is the sanctioned route and returns the title and
    // the poster, which is all a card needs.
    case "reddit": return `https://www.reddit.com/oembed?url=${u}`;
    default: return null;
  }
}

async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, accept: "application/json, text/html;q=0.9, */*;q=0.5", ...(init.headers ?? {}) } }); }
  finally { clearTimeout(t); }
}

/** More hops than any honest link needs, few enough that a redirect loop ends quickly. */
const MAX_HOPS = 5;

/**
 * Follows redirects ourselves, so an `http://` hop can be tried over `https://` first.
 *
 * A link shortener sent us to `http://inshorts.com/...`; that host answers nothing on port 80 and
 * the connection was reset, so a page carrying a full set of preview tags over https read as a save
 * with no title, no text and no picture. Letting fetch follow the chain internally gives no chance
 * to intervene at the hop that matters, so the chain is walked here instead.
 *
 * Upgrade first, fall back second: https is tried, and only if that fails at the network level is
 * the http address used as given. A site that genuinely has no https still works; one that has
 * both, which is nearly all of them now, is read over the secure one.
 */
async function fetchFollowing(f: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  let target = url;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const secure = target.startsWith("http://") ? `https://${target.slice(7)}` : target;
    let res: Response;
    try {
      res = await fetchWithTimeout(f, secure, { ...init, redirect: "manual" });
    } catch (e) {
      // Only worth a second try when we changed the address ourselves.
      if (secure === target) throw e;
      res = await fetchWithTimeout(f, target, { ...init, redirect: "manual" });
    }
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    // The body of a redirect is never read; leaving it open holds the connection.
    await res.body?.cancel().catch(() => undefined);
    target = new URL(location, secure).toString();
  }
  throw new Error("too many redirects");
}

/** Reads at most `maxBytes` of a response body, then cancels the rest so a large page costs neither time nor memory. */
export async function readHead(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - offset);
    if (take <= 0) break;
    buf.set(c.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes named and numeric (decimal or hex) HTML entities; unknown or invalid ones are left as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

const stripTags = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

/** Reads Open Graph / Twitter Card / title tags from an HTML document. */
/**
 * A title belonging to the wall in front of a page rather than to the page.
 *
 * parseOpenGraph falls back to the document's own <title> when a site declares no preview tags,
 * which is right for an ordinary page and wrong for a block: Flipkart's wall is titled "Flipkart
 * reCAPTCHA", Cloudflare's is "Just a moment...". Stored, those become a save that looks like it
 * worked and is named after the thing that stopped it — worse than an honest failure, because
 * nothing about it invites a retry. Only ever applied to the fallback; a site that declares
 * og:title is taken at its word.
 */
/** Phrases that are only ever a wall. No real page is titled any of these. */
const BLOCK_PHRASE = /^\s*(just a moment|attention required|access denied|forbidden|error 40\d|are you a human|security check|checking your browser|please wait|robot check|blocked|one more step|verify you are human)/i;

/**
 * Words that suggest a wall but also belong to real writing — an article about CAPTCHAs is titled
 * after CAPTCHAs. They only count when the title is short enough to be a wall's own name rather
 * than a piece about one; "Flipkart reCAPTCHA" is a wall, "How CAPTCHAs actually work — a deep
 * dive into the arms race" is a Tuesday read.
 */
const BLOCK_WORD = /(recaptcha|captcha|cloudflare|ddos-guard|incapsula|bot detection)/i;
const WALL_NAME_MAX = 32;

export function looksLikeBlockTitle(title: string | undefined): boolean {
  const t = title?.trim();
  if (!t) return false;
  if (BLOCK_PHRASE.test(t)) return true;
  return t.length <= WALL_NAME_MAX && BLOCK_WORD.test(t);
}

/** "TikTok" as the description of a TikTok page says nothing about the page. */
export function isJustTheSiteName(text: string | undefined, platform: string, siteName: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return t === platform.toLowerCase() || (!!siteName && t === siteName.trim().toLowerCase());
}

/**
 * Whether a page is the page we asked for.
 *
 * Facebook answers a video address it does not recognise with HTTP 200 and a perfectly good set of
 * preview tags — for its generic Watch landing page, titled "Discover popular videos". Nothing about
 * that reads as a failure, so the save would have been stored, marked ready, and named after a page
 * nobody asked for. That is worse than an honest error, because nothing invites a second look.
 *
 * The test is the page's own declared address. Ask for /watch/?v=1234567890 and it says its address
 * is /watch/ — the identifier is gone, so this is not that video. Ask for /nasa and it says /NASA/,
 * which is the same page in different case. Only ever applied when we hold an identifier to look
 * for, and only when the page declares an address at all, so a page that says nothing is trusted
 * exactly as much as it was before.
 */
export function isWrongPage(declaredUrl: string | undefined, externalId: string | null): boolean {
  if (!declaredUrl || !externalId) return false;
  return !declaredUrl.toLowerCase().includes(externalId.toLowerCase());
}

export function parseOpenGraph(html: string): { title?: string; ogTitle?: string; twitterTitle?: string; description?: string; image?: string; siteName?: string; author?: string; url?: string } {
  const head = html.slice(0, 200_000);
  const meta = (names: string[]): string | undefined => {
    for (const n of names) {
      const value = `content=(?:"([^"]*)"|'([^']*)')`;
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*?${value}|<meta[^>]+?${value}[^>]*(?:property|name)=["']${n}["']`, "i");
      const m = re.exec(head);
      const v = (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4])?.trim();
      if (v) return stripTags(v);
    }
    return undefined;
  };
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1]?.trim();
  const out: ReturnType<typeof parseOpenGraph> = {};
  const ogTitle = meta(["og:title", "twitter:title"]); if (ogTitle) out.ogTitle = ogTitle;
  const title = ogTitle ?? titleTag; if (title) out.title = title;
  const twitterTitle = meta(["twitter:title"]); if (twitterTitle) out.twitterTitle = twitterTitle;
  const description = meta(["og:description", "twitter:description", "description"]); if (description) out.description = description;
  const image = meta(["og:image", "twitter:image"]); if (image) out.image = image;
  const siteName = meta(["og:site_name"]); if (siteName) out.siteName = siteName;
  const author = meta(["author", "article:author"]); if (author) out.author = author;
  // What the page says its own address is. og:url first, then the canonical link.
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*?href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*?rel=["']canonical["']/i.exec(head);
  const url = meta(["og:url"]) ?? (canonical?.[1] ?? canonical?.[2])?.trim();
  if (url) out.url = url;
  return out;
}

/**
 * Instagram's link-preview tags carry what tokenless oEmbed withholds:
 *   twitter:title  "Name (@handle) • Instagram reel"      og:title  "Name on Instagram: "caption""
 *   og:description "1,234 likes, 5 comments - handle on August 21, 2026: "caption""
 */
export function parseInstagramOpenGraph(html: string): { authorName?: string; authorHandle?: string; caption?: string } {
  const og = parseOpenGraph(html);
  const out: ReturnType<typeof parseInstagramOpenGraph> = {};
  const card = /^(.+?)\s*\(@([A-Za-z0-9._]+)\)\s*•/.exec(og.twitterTitle ?? "");
  if (card) { out.authorName = card[1]!.trim(); out.authorHandle = card[2]!; }
  const titled = /^(.+?) on Instagram: "([\s\S]*)"$/.exec(og.title ?? "");
  if (titled) { out.authorName ??= titled[1]!.trim(); out.caption = titled[2]!.trim(); }
  const described = /^[\d,.]+\s+likes?, [\d,.]+\s+comments? - ([A-Za-z0-9._]+) on /.exec(og.description ?? "");
  if (described) out.authorHandle ??= described[1]!;
  return out;
}

/** Fetches a page and reads its link-preview tags. Best effort: any failure returns null. */
async function fetchOpenGraph(f: typeof fetch, url: string): Promise<{ html: string; og: ReturnType<typeof parseOpenGraph> } | null> {
  try {
    const res = await fetchFollowing(f, url, { headers: { accept: "text/html, */*;q=0.5" } });
    if (classifyHttp(res.status) !== "ok") return null;
    const html = await readHead(res, MAX_HTML_BYTES);
    return { html, og: parseOpenGraph(html) };
  } catch {
    return null;
  }
}

function classifyHttp(status: number): "unavailable" | "retry" | "ok" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status >= 500) return "retry";
  return "unavailable";
}

export async function enrich(item: EnrichableItem, deps: EnrichDeps): Promise<EnrichResult> {
  const patch: EnrichPatch = {};
  const retry = (error: string): EnrichResult => ({
    status: "failed", patch, error, retryAfterMs: item.enrich_attempts < RETRY_LADDER_MS.length ? RETRY_LADDER_MS[item.enrich_attempts]! : 0,
  });

  let platform = item.platform;
  let canonical = item.canonical_url;
  let sourceUrl = item.source_url;

  // 1. Expand short links, then re-normalise.
  if (item.needs_expansion && sourceUrl) {
    try {
      const res = await fetchFollowing(deps.fetch, sourceUrl, { headers: { "user-agent": BROWSER_UA } });
      const finalUrl = res.url || sourceUrl;
      const link = normalize({ url: finalUrl });
      if (link.platform !== "note" && !link.needsExpansion && link.recognised) {
        platform = link.platform; canonical = link.canonicalUrl; sourceUrl = link.sourceUrl ?? finalUrl;
        Object.assign(patch, { platform, kind: link.kind, canonical_url: canonical, external_id: link.externalId, source_url: sourceUrl, needs_expansion: false });
      } else if (link.platform !== "note" && !link.needsExpansion) {
        // A bot wall or a dead link sends the follower to the platform's front door. That page is
        // not what the person saved, so it is never adopted; the short link stays as it was shared.
        deps.log("enrich: short link led to an unrecognised page", { item: item.id, platform: link.platform, at: finalUrl.slice(0, 80) });
        return { status: "preview_unavailable", patch, error: "short link led to an unrecognised page" };
      } else {
        return { status: "preview_unavailable", patch, error: "short link did not resolve" };
      }
    } catch (e) {
      return retry(`expand: ${String(e).slice(0, 200)}`);
    }
  }

  // 2. Metadata. No-link posts and notes have nothing to fetch.
  const target = canonical ?? sourceUrl;
  let status: ItemStatus = item.status === "no_link" ? "no_link" : "ready";
  const playlist = platform === "youtube" ? playlistId(target) : null;
  if (playlist && deps.youtubeKey) {
    try {
      const q = new URLSearchParams({ part: "snippet,status", id: playlist, key: deps.youtubeKey });
      const res = await fetchFollowing(deps.fetch, `https://www.googleapis.com/youtube/v3/playlists?${q.toString()}`);
      const found = res.ok ? parsePlaylist(await res.json().catch(() => null)) : null;
      if (found) {
        if (!item.title) patch.title = found.title;
        if (found.channel && !item.author_name) patch.author_name = found.channel;
        if (found.thumbnail && !item.thumbnail_url_remote) patch.thumbnail_url_remote = found.thumbnail;
        patch.media_meta = { ...(patch.media_meta ?? {}), youtube_playlist: true, embeddable: found.embeddable };
        status = "ready";
      } else {
        // A playlist that has been made private, or deleted, is not a retryable failure.
        deps.log("enrich: playlist unavailable", { item: item.id, status: res.status });
        status = "preview_unavailable";
      }
    } catch (e) {
      return retry(`playlist: ${String(e).slice(0, 200)}`);
    }
  } else if (platform !== "note" && item.status !== "no_link" && target) {
    const oe = oembedUrl(platform, target);
    try {
      const res = await fetchFollowing(deps.fetch, oe ?? target);
      const verdict = classifyHttp(res.status);
      if (verdict === "retry") return retry(`metadata ${res.status}`);

      // Whether to ask the permalink itself for a preview. Two ways to get here: the provider
      // refused outright (a private post, or a feature this app is not approved for), or it
      // answered without the fields a card needs.
      let askThePage = false;

      if (verdict === "unavailable") {
        askThePage = !!oe;
        if (!oe) status = "preview_unavailable";
      } else if (oe) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : undefined);
        const title = s("title");
        if (title && !item.text && platform === "instagram") patch.text = title; // Instagram's oEmbed title is the caption
        else if (title && !item.title) patch.title = title;
        if (s("author_name") && !item.author_name) patch.author_name = s("author_name");
        if (s("author_url")) patch.author_handle = s("author_url");
        if (s("thumbnail_url") && !item.thumbnail_url_remote) patch.thumbnail_url_remote = s("thumbnail_url");
        if (platform === "x" && s("html") && !item.text) patch.text = stripTags(s("html")!);
        patch.media_meta = { oembed: { provider: s("provider_name"), type: s("type"), width: j["thumbnail_width"], height: j["thumbnail_height"] } };
        // TikTok's thumbnail is a frame of the video, so its size is the video's shape — the same
        // number the YouTube probe below learns for a Short. Other providers send posters and
        // crops, which say nothing about the shape.
        if (platform === "tiktok") {
          const w = j["thumbnail_width"], h = j["thumbnail_height"];
          if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) patch.media_meta = { ...patch.media_meta, aspect: Math.round((w / h) * 1000) / 1000 };
        }
        // Reddit answers our server 403 for the post page, and every non-browser client a JS
        // challenge, so asking it is a wasted request on every single save. Its picture comes from
        // the feed in step 3b instead. See ERRORS.md, 12 Sep.
        askThePage = platform !== "reddit" && (!(patch.author_name ?? item.author_name) || !(patch.thumbnail_url_remote ?? item.thumbnail_url_remote));
      } else {
        const html = await readHead(res, MAX_HTML_BYTES);
        const og = parseOpenGraph(html);
        if (isWrongPage(og.url, patch.external_id ?? item.external_id)) {
          deps.log("enrich: page is not the one asked for", { item: item.id, declared: og.url?.slice(0, 80) });
          status = "preview_unavailable";
          return { status, patch };
        }
        // A declared og:title is trusted; a bare <title> is not, because that is where a block page
        // puts its own name.
        const declared = og.ogTitle ?? og.twitterTitle;
        const usable = declared ?? (looksLikeBlockTitle(og.title) ? undefined : og.title);
        const description = isJustTheSiteName(og.description, platform, og.siteName) ? undefined : og.description;
        if (usable && !item.title) patch.title = usable;
        if (description && !item.text) patch.text = description;
        if (og.image && !item.thumbnail_url_remote) patch.thumbnail_url_remote = og.image;
        if (og.author && !item.author_name) patch.author_name = og.author;
        if (og.siteName) patch.media_meta = { site_name: og.siteName };
        if (!usable && !description) status = "preview_unavailable";
      }

      if (askThePage && /^https?:\/\//.test(target)) {
        const page = await fetchOpenGraph(deps.fetch, target);
        // The fallback reads a page too, and can be handed the same substitute.
        if (page && isWrongPage(page.og.url, patch.external_id ?? item.external_id)) {
          deps.log("enrich: fallback page is not the one asked for", { item: item.id, declared: page.og.url?.slice(0, 80) });
          if (verdict === "unavailable") status = "preview_unavailable";
          return { status, patch };
        }
        const ig = page && platform === "instagram" ? parseInstagramOpenGraph(page.html) : {};
        const description = page && !isJustTheSiteName(page.og.description, platform, page.og.siteName) ? page.og.description : undefined;
        let learned = false;
        if (page) {
          if (!(patch.author_name ?? item.author_name) && (ig.authorName ?? page.og.author)) { patch.author_name = ig.authorName ?? page.og.author; learned = true; }
          if (ig.authorHandle && !patch.author_handle) { patch.author_handle = ig.authorHandle; learned = true; }
          if (!(patch.thumbnail_url_remote ?? item.thumbnail_url_remote) && page.og.image) { patch.thumbnail_url_remote = page.og.image; learned = true; }
          if (!item.text && !patch.text && (ig.caption ?? description)) { patch.text = ig.caption ?? description; learned = true; }
          // Only a declared preview title, never the page's own <title>, which on a login wall reads "Login".
          if (!item.title && !patch.title && !patch.text && page.og.ogTitle) { patch.title = page.og.ogTitle; learned = true; }
        }
        if (learned) {
          patch.media_meta = { ...(patch.media_meta ?? {}), link_preview: true };
          status = "ready"; // no-link posts never reach here, so a card is what this becomes
        } else {
          deps.log(page ? "enrich: link-preview tags absent" : "enrich: link-preview fallback unavailable", { item: item.id, platform });
          // Only now is there truly nothing to show.
          if (verdict === "unavailable") status = "preview_unavailable";
        }
      }
    } catch (e) {
      return retry(`metadata: ${String(e).slice(0, 200)}`);
    }
  }

  // 2b. A provider that answered but said nothing has not made a card. Without this, an oEmbed 2xx
  //     with no fields and a page with no tags left a "ready" save with nothing on it.
  const known = !!(patch.title ?? item.title) || !!(patch.text ?? item.text) || !!(patch.author_name ?? item.author_name) || !!(patch.thumbnail_url_remote ?? item.thumbnail_url_remote);
  if (status === "ready" && platform !== "note" && !known) {
    deps.log("enrich: nothing learned", { item: item.id, platform });
    status = "preview_unavailable";
  }

  // 3. The shape of a YouTube video (never fails the item: without it the app falls back to 16:9,
  //    which is exactly where it stood before this existed).
  const videoId = patch.external_id ?? item.external_id;
  if (platform === "youtube" && deps.youtubeKey && videoId) {
    try {
      const q = new URLSearchParams({ part: "player", id: videoId, maxHeight: String(ASPECT_PROBE_PX), key: deps.youtubeKey });
      const res = await fetchWithTimeout(deps.fetch, `https://www.googleapis.com/youtube/v3/videos?${q.toString()}`);
      const aspect = res.ok ? parseAspect(await res.json().catch(() => null)) : null;
      if (aspect) patch.media_meta = { ...(patch.media_meta ?? {}), aspect };
      else deps.log("enrich: youtube shape unavailable", { item: item.id, status: res.status });
    } catch (e) {
      deps.log("enrich: youtube shape failed", { item: item.id, reason: String(e).slice(0, 120) });
    }
  }

  // 4. Thumbnail snapshot (never fails the item).
  const thumbUrl = patch.thumbnail_url_remote ?? item.thumbnail_url_remote;
  if (thumbUrl && !item.thumbnail_path) {
    try {
      const path = await deps.snapshot(item.user_id, item.id, thumbUrl);
      if (path) patch.thumbnail_path = path;
    } catch (e) {
      const reason = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      deps.log("enrich: snapshot failed", { item: item.id, reason });
      patch.media_meta = { ...(patch.media_meta ?? {}), snapshot_error: reason }; // the sweeper retries while the remote link is fresh
    }
  }

  return { status, patch };
}

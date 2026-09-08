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
  /** Stores the image at `url` as the item's thumbnail; returns the storage path or null. */
  snapshot(userId: string, itemId: string, url: string): Promise<string | null>;
  log(message: string, meta?: Record<string, unknown>): void;
}

const TIMEOUT_MS = 8_000;
const MAX_HTML = 1_000_000;
export const RETRY_LADDER_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const UA = "Mozilla/5.0 (compatible; AllkeptBot/0.1; +https://allkept.app)";

function oembedUrl(platform: Platform, url: string): string | null {
  const u = encodeURIComponent(url);
  switch (platform) {
    case "instagram": return `https://graph.facebook.com/v23.0/instagram_oembed?url=${u}&omitscript=true`;
    case "facebook": return `https://graph.facebook.com/v23.0/oembed_post?url=${u}&omitscript=true`;
    case "threads": return `https://graph.threads.net/oembed?url=${u}`;
    case "youtube": return `https://www.youtube.com/oembed?url=${u}&format=json`;
    case "x": return `https://publish.twitter.com/oembed?url=${u}&omit_script=true`;
    case "tiktok": return `https://www.tiktok.com/oembed?url=${u}`;
    default: return null;
  }
}

async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, accept: "application/json, text/html;q=0.9, */*;q=0.5", ...(init.headers ?? {}) } }); }
  finally { clearTimeout(t); }
}

const stripTags = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** Reads Open Graph / Twitter Card / title tags from an HTML document. */
export function parseOpenGraph(html: string): { title?: string; description?: string; image?: string; siteName?: string; author?: string } {
  const head = html.slice(0, 200_000);
  const meta = (names: string[]): string | undefined => {
    for (const n of names) {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i");
      const m = re.exec(head);
      const v = (m?.[1] ?? m?.[2])?.trim();
      if (v) return stripTags(v);
    }
    return undefined;
  };
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1]?.trim();
  const out: ReturnType<typeof parseOpenGraph> = {};
  const title = meta(["og:title", "twitter:title"]) ?? titleTag; if (title) out.title = title;
  const description = meta(["og:description", "twitter:description", "description"]); if (description) out.description = description;
  const image = meta(["og:image", "twitter:image"]); if (image) out.image = image;
  const siteName = meta(["og:site_name"]); if (siteName) out.siteName = siteName;
  const author = meta(["author", "article:author"]); if (author) out.author = author;
  return out;
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
      const res = await fetchWithTimeout(deps.fetch, sourceUrl, { redirect: "follow" });
      const finalUrl = res.url || sourceUrl;
      const link = normalize({ url: finalUrl });
      if (link.platform !== "note" && !link.needsExpansion) {
        platform = link.platform; canonical = link.canonicalUrl; sourceUrl = link.sourceUrl ?? finalUrl;
        Object.assign(patch, { platform, kind: link.kind, canonical_url: canonical, external_id: link.externalId, source_url: sourceUrl, needs_expansion: false });
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
  if (platform !== "note" && item.status !== "no_link" && target) {
    const oe = oembedUrl(platform, target);
    try {
      const res = await fetchWithTimeout(deps.fetch, oe ?? target);
      const verdict = classifyHttp(res.status);
      if (verdict === "retry") return retry(`metadata ${res.status}`);
      if (verdict === "unavailable") {
        status = "preview_unavailable";
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
      } else {
        const html = (await res.text()).slice(0, MAX_HTML);
        const og = parseOpenGraph(html);
        if (og.title && !item.title) patch.title = og.title;
        if (og.description && !item.text) patch.text = og.description;
        if (og.image && !item.thumbnail_url_remote) patch.thumbnail_url_remote = og.image;
        if (og.author && !item.author_name) patch.author_name = og.author;
        if (og.siteName) patch.media_meta = { site_name: og.siteName };
        if (!og.title && !og.description) status = "preview_unavailable";
      }
    } catch (e) {
      return retry(`metadata: ${String(e).slice(0, 200)}`);
    }
  }

  // 3. Thumbnail snapshot (never fails the item).
  const thumbUrl = patch.thumbnail_url_remote ?? item.thumbnail_url_remote;
  if (thumbUrl && !item.thumbnail_path) {
    try {
      const path = await deps.snapshot(item.user_id, item.id, thumbUrl);
      if (path) patch.thumbnail_path = path;
    } catch (e) {
      deps.log("enrich: snapshot failed", { item: item.id, error: String(e).slice(0, 200) });
    }
  }

  return { status, patch };
}

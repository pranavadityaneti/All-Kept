import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

/**
 * The pictures on Reddit cards.
 *
 * Reddit tells our server nothing about a post's picture: its oEmbed carries none, its feed answers
 * the edge runtime 403, and its page answers every non-browser client a bot challenge. A phone is an
 * ordinary browser client and its feed answers one plainly, so the address is found here and handed
 * to the server, which stores the picture the way it stores every other. See ERRORS.md, 12 Sep.
 */

/** Reddit rate-limits its feeds, and this runs every time the app comes forward. A handful is plenty. */
export const MAX_PER_RUN = 4;
const KEY = "allkept.reddit.no-picture";
const FEED_TIMEOUT_MS = 6_000;

export function feedUrl(canonicalUrl: string): string {
  return `${canonicalUrl.replace(/\/$/, "")}/.rss`;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** The picture Reddit names in a post's feed, or null when the post has none — as a text post never does. */
export function parseFeedThumbnail(xml: string): string | null {
  const found = /<media:thumbnail[^>]*\burl="([^"]+)"/i.exec(xml);
  if (!found) return null;
  return found[1]!.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e);
}

export interface BackfillDeps {
  /** Reddit saves with no picture stored and none on the way. */
  candidates(): Promise<{ id: string; canonicalUrl: string | null }[]>;
  /** The feed's text, or null when it could not be read — which says nothing about the post. */
  fetchFeed(url: string): Promise<string | null>;
  store(itemId: string, imageUrl: string): Promise<void>;
  /** Saves already known to have no picture; they are never asked about again. */
  checked(): Promise<string[]>;
  remember(ids: string[]): Promise<void>;
}

export async function backfillRedditThumbnails(deps: BackfillDeps): Promise<{ stored: number; noPicture: number }> {
  const skip = new Set(await deps.checked());
  const todo = (await deps.candidates()).filter((c) => !skip.has(c.id)).slice(0, MAX_PER_RUN);
  let stored = 0;
  const none: string[] = [];

  for (const item of todo) {
    try {
      if (!item.canonicalUrl) { none.push(item.id); continue; }
      const xml = await deps.fetchFeed(feedUrl(item.canonicalUrl));
      if (xml === null) continue; // a refusal now is not an answer about the post; try again later
      const picture = parseFeedThumbnail(xml);
      if (!picture) { none.push(item.id); continue; }
      await deps.store(item.id, picture);
      stored++;
    } catch {
      // One save's bad luck is not the next one's.
    }
  }
  if (none.length > 0) await deps.remember(none);
  return { stored, noPicture: none.length };
}

/** The real doors, for the app. */
export function backfillDeps(): BackfillDeps {
  return {
    async candidates() {
      const { data, error } = await supabase.from("items")
        .select("id, canonical_url")
        .eq("platform", "reddit").is("thumbnail_path", null).is("thumbnail_url_remote", null)
        .order("created_at", { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id as string, canonicalUrl: (r.canonical_url as string | null) ?? null }));
    },
    async fetchFeed(url) {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), FEED_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: stop.signal, headers: { accept: "application/rss+xml, text/xml" } });
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    async store(itemId, imageUrl) {
      const { error } = await supabase.functions.invoke("reddit-thumbnail", { body: { itemId, imageUrl } });
      if (error) throw new Error(String(error));
    },
    async checked() {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
      } catch {
        return [];
      }
    },
    async remember(ids) {
      try {
        const had = await this.checked();
        // Bounded: a library of Reddit text posts must not grow this list without end.
        const next = [...new Set([...had, ...ids])].slice(-500);
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
      } catch { /* a phone that will not remember simply looks again */ }
    },
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveLink } from "@allkept/normalize";
import { storePicture } from "./reddit-thumbnail";
import { supabase } from "./supabase";

/**
 * The pictures on Instagram cards the server could not get.
 *
 * Instagram serves a datacentre its login page instead of a post now and then, and that page names
 * no picture of the post. A phone is an ordinary client and is shown the post itself, so the poster
 * is read here — before a pasted link is saved, so it travels with the save, and afterwards for
 * saves the server settled without one — and handed to the server, which stores the picture the
 * way it stores every other. The same shape as the Reddit backfill beside this.
 */

/** This runs every time the app comes forward, and each look is a whole post page. A handful is plenty. */
export const MAX_PER_RUN = 4;
/** A phone can be walled too, and a private post is walled for everyone. After this many walls a save is left alone. */
export const MAX_WALLS = 5;
const KEY = "allkept.instagram.no-picture";
const WALLS_KEY = "allkept.instagram.walls";
/** Long enough for a post page, short enough that saving never feels stuck behind it. */
const PAGE_TIMEOUT_MS = 4_000;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (v: string) => v.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e);

/** One link-preview tag's content, whichever way round its attributes come. Tags live in the head; reading stops well before a 650 KB page ends. */
function tag(html: string, property: string): string | null {
  const head = html.slice(0, 200_000);
  const value = `content=(?:"([^"]*)"|'([^']*)')`;
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]*?${value}|<meta[^>]+?${value}[^>]*property=["']${property}["']`, "i");
  const m = re.exec(head);
  const v = (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4])?.trim();
  return v ? decode(v) : null;
}

export type PageAnswer = { kind: "picture"; url: string } | { kind: "none" } | { kind: "wall" };

/**
 * What a post page says about its picture.
 *
 * A wall is known by the address the page declares: Instagram's login page calls itself
 * instagram.com/ and carries the Instagram logo as its image, which must never become a card's
 * picture. A page that declares no address and names no picture is not the post either. "none" —
 * the post really has no picture — is only ever said by the post's own page.
 */
export function readPostPage(html: string, externalId: string): PageAnswer {
  const declared = tag(html, "og:url");
  if (declared && !declared.toLowerCase().includes(externalId.toLowerCase())) return { kind: "wall" };
  const image = tag(html, "og:image");
  if (image) return { kind: "picture", url: image };
  return declared ? { kind: "none" } : { kind: "wall" };
}

/** The page's text, or null when it could not be read — which says nothing about the post. */
export async function fetchPostPage(url: string, doFetch: typeof fetch = fetch): Promise<string | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: stop.signal, headers: { accept: "text/html" } });
    // Sent to log in ourselves: not the post, and not an answer about it.
    if (!res.ok || /\/accounts\/login/i.test(res.url ?? "")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The poster for a pasted Instagram post or reel, read before the save so it travels with it.
 * Null whenever there is nothing to add — another platform, a profile, a wall, no picture, a page
 * that could not be read — and the save goes ahead exactly as it would have.
 */
export async function pictureForSave(text: string, doFetch: typeof fetch = fetch): Promise<string | null> {
  const link = saveLink(text);
  if (!link || link.platform !== "instagram" || (link.kind !== "post" && link.kind !== "short_video") || !link.canonicalUrl || !link.externalId) return null;
  const html = await fetchPostPage(link.canonicalUrl, doFetch);
  if (html === null) return null;
  const answer = readPostPage(html, link.externalId);
  return answer.kind === "picture" ? answer.url : null;
}

/** One more wall against each save, and the saves that have now had their share. Bounded; the oldest are forgotten first. */
export function countWalls(had: Record<string, number>, ids: string[]): { counts: Record<string, number>; spent: string[] } {
  const counts: Record<string, number> = { ...had };
  const spent: string[] = [];
  for (const id of ids) {
    delete counts[id]; // put back at the end, so it counts as the newest
    counts[id] = (had[id] ?? 0) + 1;
    if (counts[id]! >= MAX_WALLS) spent.push(id);
  }
  const keys = Object.keys(counts);
  for (const key of keys.slice(0, Math.max(0, keys.length - 500))) delete counts[key];
  return { counts, spent };
}

export interface PictureDeps {
  /** Instagram saves the server settled without a picture: none stored, and no usable address held. */
  candidates(): Promise<{ id: string; canonicalUrl: string | null; externalId: string | null }[]>;
  /** The post page's text, or null when it could not be read — which says nothing about the post. */
  fetchPage(url: string): Promise<string | null>;
  store(itemId: string, imageUrl: string): Promise<void>;
  /** Saves not to ask about again: known to have no picture, or walled once too often. */
  checked(): Promise<string[]>;
  /** "none": the post really has no picture, final. "wall": one more wall against the save; final after MAX_WALLS. */
  remember(ids: string[], reason: "none" | "wall"): Promise<void>;
}

export async function backfillInstagramPictures(deps: PictureDeps): Promise<{ stored: number; noPicture: number }> {
  const skip = new Set(await deps.checked());
  const todo = (await deps.candidates()).filter((c) => !skip.has(c.id)).slice(0, MAX_PER_RUN);
  let stored = 0;
  const none: string[] = [];
  const walled: string[] = [];

  for (const item of todo) {
    try {
      if (!item.canonicalUrl || !item.externalId) { none.push(item.id); continue; }
      const html = await deps.fetchPage(item.canonicalUrl);
      if (html === null) continue; // could not be read now: not an answer about the post; try again later
      const answer = readPostPage(html, item.externalId);
      if (answer.kind === "wall") { walled.push(item.id); continue; } // the phone was walled too, this time
      if (answer.kind === "none") { none.push(item.id); continue; }
      await deps.store(item.id, answer.url);
      stored++;
    } catch {
      // One save's bad luck is not the next one's.
    }
  }
  if (none.length > 0) await deps.remember(none, "none");
  if (walled.length > 0) await deps.remember(walled, "wall");
  return { stored, noPicture: none.length };
}

/** The real doors, for the app. */
export function pictureDeps(): PictureDeps {
  return {
    async candidates() {
      const { data, error } = await supabase.from("items")
        .select("id, canonical_url, external_id")
        .eq("platform", "instagram").in("status", ["ready", "preview_unavailable"]).is("thumbnail_path", null)
        // No address held, or one that proved not to be a picture (a video post's video file).
        .or("thumbnail_url_remote.is.null,media_meta->>snapshot_error.like.not an image*")
        .order("created_at", { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id as string, canonicalUrl: (r.canonical_url as string | null) ?? null, externalId: (r.external_id as string | null) ?? null }));
    },
    fetchPage: (url) => fetchPostPage(url),
    store: storePicture,
    async checked() {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
      } catch {
        return [];
      }
    },
    async remember(ids, reason) {
      try {
        let final = ids;
        if (reason === "wall") {
          const raw = await AsyncStorage.getItem(WALLS_KEY);
          const parsed: unknown = raw ? JSON.parse(raw) : {};
          const had: Record<string, number> = {};
          if (parsed && typeof parsed === "object") for (const [k, v] of Object.entries(parsed)) if (typeof v === "number") had[k] = v;
          const { counts, spent } = countWalls(had, ids);
          await AsyncStorage.setItem(WALLS_KEY, JSON.stringify(counts));
          final = spent;
        }
        if (final.length === 0) return;
        const had = await this.checked();
        // Bounded: a library of pictureless posts must not grow this list without end.
        const next = [...new Set([...had, ...final])].slice(-500);
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
      } catch { /* a phone that will not remember simply looks again */ }
    },
  };
}

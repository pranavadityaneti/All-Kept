import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalize, type NormalizedLink } from "@allkept/normalize";
import { supabase } from "./supabase";

/**
 * The share links the server is not allowed to follow.
 *
 * Reddit and TikTok hand their apps a short link — reddit.com/r/x/s/… , vm.tiktok.com/… — and refuse
 * to resolve it for a request coming from a datacentre. The app's own paste field already follows
 * one before saving (resolve-link.ts), but the share sheet posts straight to the server, which is
 * the way most links actually arrive. Those saves land with no title and no picture.
 *
 * A phone is an ordinary client and is not refused, so it follows them here, writes the real address
 * onto the save, and asks for the preview again. Same columns the "add the original link" flow
 * rewrites, and nothing a client is not already trusted with.
 */

/** These are network round trips on a phone, and this runs every time the app comes forward. */
export const MAX_PER_RUN = 4;
const KEY = "allkept.links.unresolvable";
const FOLLOW_TIMEOUT_MS = 8_000;

export interface ResolveDeps {
  /** Saves whose short link the server could not follow. */
  candidates(): Promise<{ id: string; sourceUrl: string | null }[]>;
  /** Where the link really points, or null when it could not be followed at all. */
  resolve(url: string): Promise<string | null>;
  rewrite(itemId: string, link: NormalizedLink): Promise<void>;
  /** Links already found to lead nowhere worth keeping; never followed again. */
  checked(): Promise<string[]>;
  remember(ids: string[]): Promise<void>;
}

export async function backfillUnresolvedLinks(deps: ResolveDeps): Promise<{ resolved: number; unresolvable: number }> {
  const skip = new Set(await deps.checked());
  const todo = (await deps.candidates()).filter((c) => !skip.has(c.id)).slice(0, MAX_PER_RUN);
  let resolved = 0;
  const hopeless: string[] = [];

  for (const item of todo) {
    try {
      if (!item.sourceUrl) { hopeless.push(item.id); continue; }
      const final = await deps.resolve(item.sourceUrl);
      // Could not be followed now: offline, or the platform refusing this minute. That says nothing
      // about the link, so it stays a candidate.
      if (final === null) continue;
      const link = normalize({ url: final });
      if (link.platform === "note" || link.needsExpansion || !link.recognised || !link.sourceUrl) { hopeless.push(item.id); continue; }
      await deps.rewrite(item.id, link);
      resolved++;
    } catch {
      // One save's bad luck is not the next one's.
    }
  }
  if (hopeless.length > 0) await deps.remember(hopeless);
  return { resolved, unresolvable: hopeless.length };
}

/** The real doors, for the app. */
export function resolveDeps(): ResolveDeps {
  return {
    async candidates() {
      const { data, error } = await supabase.from("items")
        .select("id, source_url")
        .eq("needs_expansion", true).eq("status", "preview_unavailable")
        .order("created_at", { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id as string, sourceUrl: (r.source_url as string | null) ?? null }));
    },
    async resolve(url) {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), FOLLOW_TIMEOUT_MS);
      try {
        const res = await fetch(url, { redirect: "follow", signal: stop.signal });
        return res.url && res.url !== url ? res.url : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    async rewrite(itemId, link) {
      const { error } = await supabase.from("items").update({
        platform: link.platform, kind: link.kind, source_url: link.sourceUrl, canonical_url: link.canonicalUrl,
        external_id: link.externalId, needs_expansion: false, status: "pending", enrich_attempts: 0, next_attempt_at: null,
      }).eq("id", itemId);
      // A link that turns out to be something already saved trips the identity index. That is a
      // duplicate, not a failure, and the save it collided with is the one worth keeping.
      if (error) throw new Error(error.message);
      await supabase.functions.invoke("reprocess-item", { body: { itemId } });
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
        const next = [...new Set([...had, ...ids])].slice(-500);
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
      } catch { /* a phone that will not remember simply looks again */ }
    },
  };
}

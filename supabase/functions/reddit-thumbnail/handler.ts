// Reddit will not tell our server where a post's picture is: its feed answers the edge runtime 403
// and its page answers every non-browser client a bot challenge. A phone is an ordinary browser
// client, so the app reads the feed and brings the address here. It may name only a Reddit image
// host — the server fetches whatever address it is given, and a client must never be able to point
// that at somewhere else. See ERRORS.md, 12 Sep.
import { apiError, json, readJson } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Where each platform serves post pictures. A save may only name a host belonging to its own
 * platform: the server fetches whatever address it is handed, so this is the whole defence.
 * Exact hosts where the set is known, and whole-domain suffixes where the subdomain varies —
 * matched on a dot boundary, so "tiktokcdn-us.com.evil.com" and "eviltiktokcdn.com" are refused.
 */
const PICTURE_HOSTS: Record<string, { exact?: string[]; domains?: string[] }> = {
  reddit: { exact: ["preview.redd.it", "external-preview.redd.it", "i.redd.it", "a.thumbs.redditmedia.com", "b.thumbs.redditmedia.com"] },
  // TikTok names a different signing host per region and post — p16-common-sign, p19-…-us, and more.
  tiktok: { domains: ["tiktokcdn.com", "tiktokcdn-us.com"] },
};

export function isPictureHost(url: string, platform: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    const allowed = PICTURE_HOSTS[platform];
    if (!allowed) return false;
    if (allowed.exact?.includes(host)) return true;
    return (allowed.domains ?? []).some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

/** Kept for the Reddit path's own tests; the general rule above is what the handler uses. */
export function isRedditImageHost(url: string): boolean {
  return isPictureHost(url, "reddit");
}

export interface RedditThumbnailDeps {
  userId(req: Request): Promise<string | null>;
  /** The save's platform when this person owns it and it has no picture yet; null otherwise. */
  platformOfItemNeedingPicture(itemId: string, userId: string): Promise<string | null>;
  storeRemoteThumbnail(itemId: string, url: string): Promise<void>;
}

export async function handleRedditThumbnail(req: Request, deps: RedditThumbnailDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");

  const body = await readJson(req);
  const itemId = typeof body?.["itemId"] === "string" ? body["itemId"] : "";
  const imageUrl = typeof body?.["imageUrl"] === "string" ? body["imageUrl"] : "";
  if (!UUID.test(itemId)) return apiError("bad_request", "itemId must be a uuid");

  // The platform is read from the save, never taken from the caller, so an address can only be
  // accepted for the platform the save actually belongs to.
  const platform = await deps.platformOfItemNeedingPicture(itemId, userId);
  if (!platform) return apiError("not_found", "no such save waiting for a picture");
  if (!isPictureHost(imageUrl, platform)) return apiError("bad_request", "imageUrl must be a picture address belonging to that save's platform");

  await deps.storeRemoteThumbnail(itemId, imageUrl);
  return json({ stored: true });
}

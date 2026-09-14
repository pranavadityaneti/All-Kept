// Reddit will not tell our server where a post's picture is: its feed answers the edge runtime 403
// and its page answers every non-browser client a bot challenge. Instagram serves a datacentre its
// login page instead of a post now and then. A phone is an ordinary browser client, so the app
// reads the feed or the page and brings the address here. It may name only a picture host of the
// save's own platform — the server fetches whatever address it is given, and a client must never
// be able to point that at somewhere else. See ERRORS.md, 12 Sep.
import { apiError, json, readJson } from "../_shared/http.ts";
import { isPictureHost } from "../_shared/picture-hosts.ts";
export { isPictureHost };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

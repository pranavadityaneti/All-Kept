// Reddit will not tell our server where a post's picture is: its feed answers the edge runtime 403
// and its page answers every non-browser client a bot challenge. A phone is an ordinary browser
// client, so the app reads the feed and brings the address here. It may name only a Reddit image
// host — the server fetches whatever address it is given, and a client must never be able to point
// that at somewhere else. See ERRORS.md, 12 Sep.
import { apiError, json, readJson } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Where Reddit serves post pictures. Matched as whole hosts, never as suffixes. */
const IMAGE_HOSTS = new Set([
  "preview.redd.it", "external-preview.redd.it", "i.redd.it",
  "a.thumbs.redditmedia.com", "b.thumbs.redditmedia.com",
]);

export function isRedditImageHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && IMAGE_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface RedditThumbnailDeps {
  userId(req: Request): Promise<string | null>;
  /** True only when this person owns the item, it is a Reddit save, and it has no stored picture yet. */
  ownedRedditItemNeedingPicture(itemId: string, userId: string): Promise<boolean>;
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
  if (!isRedditImageHost(imageUrl)) return apiError("bad_request", "imageUrl must be a Reddit image address");

  if (!(await deps.ownedRedditItemNeedingPicture(itemId, userId))) return apiError("not_found", "no such Reddit save waiting for a picture");
  await deps.storeRemoteThumbnail(itemId, imageUrl);
  return json({ stored: true });
}

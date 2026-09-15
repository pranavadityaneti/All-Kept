// A place the person names for a save: looked up on the spot, kept against every re-sort.
//
// The sorter reads a venue only from what the post says. When the post says nothing — "stumbled
// upon this gem in jaipur" — the person is the one who knows, and this takes their words, runs the
// same lookup the sweeper runs, and writes the place. Their words are kept beside the sorter's,
// never over them, so a re-sort cannot take the place away. Pure; the caller's id, the row, the
// resolver and the writes are injected.
import { apiError, json, readJson } from "../_shared/http.ts";
import type { Candidate, Resolution, Venue } from "../_shared/places.ts";

export interface ResolvePlaceDeps {
  userId(req: Request): Promise<string | null>;
  /** True when the caller owns the save. */
  owned(userId: string, itemId: string): Promise<boolean>;
  resolve(venue: Venue): Promise<Resolution>;
  /** Writes the person's venue and the place found, or the venue and the miss. */
  write(itemId: string, venue: Venue, place: Candidate | null, miss: string | null): Promise<void>;
  /** Clears the person's venue and the place, leaving the sorter's own venue, if any, to be looked up again. */
  clear(itemId: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHARS = 80;

/** What the person typed, as a venue: a name and what places it, or nothing worth looking up. */
export function venueFromWords(name: unknown, locality: unknown): Venue | null {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  const l = typeof locality === "string" ? locality.trim().replace(/\s+/g, " ") : "";
  if (n.length < 2 || n.length > MAX_CHARS || l.length < 2 || l.length > MAX_CHARS) return null;
  return { name: n, locality: l };
}

export async function handleResolvePlace(req: Request, deps: ResolvePlaceDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");
  const body = await readJson(req);
  const itemId = typeof body?.["itemId"] === "string" ? body["itemId"] : "";
  if (!UUID.test(itemId)) return apiError("bad_request", "itemId is required");
  if (!(await deps.owned(userId, itemId))) return apiError("not_found", "no such save");

  if (body?.["clear"] === true) {
    await deps.clear(itemId);
    return json({ cleared: true });
  }
  const venue = venueFromWords(body?.["name"], body?.["locality"]);
  if (!venue) return apiError("bad_request", "a name and a place are required");
  const result = await deps.resolve(venue);
  if (result.reason === "providers unreachable") return apiError("unavailable", "The maps are not answering. Try again in a moment.");
  await deps.write(itemId, venue, result.place, result.place ? null : result.reason);
  const p = result.place;
  return json({ venue, place: p ? { name: p.name, address: p.address, lat: p.lat, lng: p.lng, status: p.status, url: p.url } : null });
}

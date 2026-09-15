// A venue becomes a place.
//
// The sorter writes a venue as text — "Haku, Bandra" — exactly as the post named it. This looks
// it up once, on Apple's Maps Server API first and Google's Places API when Apple has nothing that
// matches, and keeps what comes back: coordinates, an address, a category, hours where the
// provider gives them, and a stable id. Pure: the providers are injected, so the rules — which
// answer is the venue, when to fall back, what a miss records — are tested without a network.
// See internal/superpowers/specs/2026-09-15-export-out-design.md, stage B.

export interface Venue { name: string; locality: string }

export interface Candidate {
  provider: "apple" | "google";
  providerId: string;
  name: string;
  address: string | null;
  locality: string | null;
  lat: number;
  lng: number;
  category: string | null;
  /** Lines a person can read, as the provider gives them; only Google does. */
  hours: string[] | null;
  /** Google's word for it: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY. */
  status: string | null;
  url: string | null;
}

export interface Resolution { place: Candidate | null; reason: string | null }

export interface PlacesDeps {
  apple(query: string): Promise<Candidate[]>;
  /** Null when no Google key is configured. */
  google: ((query: string) => Promise<Candidate[]>) | null;
}

/** Words only: case, accents and punctuation folded away, so "Café Delhi Heights" is "cafe delhi heights". */
const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** "The" and "&" make no name; the rest of the words must all be there, in one or the other. */
const words = (s: string): string[] => fold(s).split(" ").filter((w) => w.length > 0 && w !== "the" && w !== "and");

/** The venue's name and a candidate's agree when one's words are all in the other's, in order. */
export function sameName(venue: string, candidate: string): boolean {
  const a = words(venue), b = words(candidate);
  if (a.length === 0 || b.length === 0) return false;
  const contains = (outer: string[], inner: string[]) => outer.join(" ").includes(inner.join(" ")) && inner.every((w) => outer.includes(w));
  return contains(b, a) || contains(a, b);
}

/** The first candidate that is a place — something with a category — whose name is the venue's. */
export function pickCandidate(venue: Venue, candidates: Candidate[]): Candidate | null {
  return candidates.find((c) => c.category !== null && sameName(venue.name, c.name)) ?? null;
}

export const venueQuery = (venue: Venue): string => `${venue.name}, ${venue.locality}`;

/**
 * Apple first, Google when Apple has nothing that matches. A provider that is down is skipped;
 * both down is its own reason, so the row is tried again rather than marked a miss.
 */
export async function resolveVenue(venue: Venue, deps: PlacesDeps): Promise<Resolution> {
  const query = venueQuery(venue);
  let unreachable = 0;
  const providers: (((q: string) => Promise<Candidate[]>) | null)[] = [deps.apple, deps.google];
  for (const provider of providers) {
    if (!provider) continue;
    try {
      const place = pickCandidate(venue, await provider(query));
      if (place) return { place, reason: null };
    } catch {
      unreachable++;
    }
  }
  const asked = providers.filter((p) => p !== null).length;
  return { place: null, reason: unreachable === asked ? "providers unreachable" : "no match" };
}

/** Apple's /v1/search answer, read defensively: a result without a coordinate is not a place. */
export function appleFromSearch(body: unknown): Candidate[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r): Candidate[] => {
    const o = r as Record<string, unknown>;
    const coord = o["coordinate"] as { latitude?: unknown; longitude?: unknown } | undefined;
    const lat = coord?.latitude, lng = coord?.longitude;
    if (typeof o["name"] !== "string" || typeof lat !== "number" || typeof lng !== "number") return [];
    const lines = Array.isArray(o["formattedAddressLines"]) ? (o["formattedAddressLines"] as unknown[]).filter((l): l is string => typeof l === "string") : [];
    const structured = o["structuredAddress"] as { locality?: unknown } | undefined;
    return [{
      provider: "apple",
      providerId: typeof o["id"] === "string" ? o["id"] : `${lat},${lng}`,
      name: o["name"],
      address: lines.length > 0 ? lines.join(", ") : null,
      locality: typeof structured?.locality === "string" ? structured.locality : null,
      lat, lng,
      category: typeof o["poiCategory"] === "string" ? o["poiCategory"] : null,
      hours: null, status: null, url: null,
    }];
  });
}

/** Google's places:searchText answer, read the same way. */
export function googleFromSearch(body: unknown): Candidate[] {
  const places = (body as { places?: unknown })?.places;
  if (!Array.isArray(places)) return [];
  return places.flatMap((p): Candidate[] => {
    const o = p as Record<string, unknown>;
    const name = (o["displayName"] as { text?: unknown } | undefined)?.text;
    const loc = o["location"] as { latitude?: unknown; longitude?: unknown } | undefined;
    if (typeof o["id"] !== "string" || typeof name !== "string" || typeof loc?.latitude !== "number" || typeof loc?.longitude !== "number") return [];
    const hours = (o["regularOpeningHours"] as { weekdayDescriptions?: unknown } | undefined)?.weekdayDescriptions;
    return [{
      provider: "google",
      providerId: o["id"],
      name,
      address: typeof o["formattedAddress"] === "string" ? o["formattedAddress"] : null,
      locality: null,
      lat: loc.latitude, lng: loc.longitude,
      category: typeof o["primaryType"] === "string" ? o["primaryType"] : null,
      hours: Array.isArray(hours) ? hours.filter((h): h is string => typeof h === "string") : null,
      status: typeof o["businessStatus"] === "string" ? o["businessStatus"] : null,
      url: typeof o["googleMapsUri"] === "string" ? o["googleMapsUri"] : null,
    }];
  });
}

export interface PlacesPassDeps {
  /** Rows with a venue and no place yet, oldest first, up to the limit. */
  rows(limit: number): Promise<{ itemId: string; venue: Venue }[]>;
  resolve(venue: Venue): Promise<Resolution>;
  /** Writes the place and points the row at it, or records the miss so the row is not asked again for a month. */
  save(itemId: string, result: Resolution): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** The sweeper's pass: a bounded batch, one row's failure never the batch's. */
export async function runPlacesPass(deps: PlacesPassDeps, limit: number): Promise<{ rows: number; resolved: number; unresolved: number; failed: number }> {
  const rows = await deps.rows(limit);
  const out = { rows: rows.length, resolved: 0, unresolved: 0, failed: 0 };
  for (const row of rows) {
    try {
      const result = await deps.resolve(row.venue);
      await deps.save(row.itemId, result);
      if (result.place) out.resolved++; else out.unresolved++;
    } catch (e) {
      out.failed++;
      deps.log("places: row failed", { item: row.itemId, error: String(e).slice(0, 200) });
    }
  }
  return out;
}

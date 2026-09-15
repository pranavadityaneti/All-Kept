// A venue becomes a place.
//
// The sorter writes a venue as text — "Haku, Bandra" — exactly as the post named it. This looks
// it up once, on Google's Places API first, since Google knows the hours, whether the place is
// still open at all and its own page, and Apple's Maps Server API when Google has nothing that
// matches (or no key is configured), and keeps what comes back: coordinates, an address, a
// category, hours where the provider gives them, and a stable id. Pure: the providers are
// injected, so the rules — which answer is the venue, when to fall back, what a miss records —
// are tested without a network. See internal/superpowers/specs/2026-09-15-export-out-design.md, stage B.

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
  /** The hours as Google structures them — {open: {day, hour, minute}, close: {…}}, day 0 Sunday — so a phone can say whether the place is open now. Only Google. */
  periods: OpeningPeriod[] | null;
  /** The place's offset from UTC in minutes, without which the periods say nothing about now. Only Google. */
  utcOffsetMinutes: number | null;
}

export interface OpeningPoint { day: number; hour: number; minute: number }
export interface OpeningPeriod { open: OpeningPoint; close?: OpeningPoint }

export interface Resolution { place: Candidate | null; reason: string | null }

export interface PlacesDeps {
  apple(query: string): Promise<Candidate[]>;
  /** Null when no Google key is configured. */
  google: ((query: string) => Promise<Candidate[]>) | null;
}

/** Words only: case, accents and punctuation folded away, so "Café Delhi Heights" is "cafe delhi heights". */
const fold = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** "The" and "&" make no name; the rest of the words must all be there, in one or the other. */
const words = (s: string): string[] => fold(s).split(" ").filter((w) => w.length > 0 && w !== "the" && w !== "and");

/** How a venue's name and a candidate's agree: the same words, one's words all in the other's in order, or not at all. */
function nameMatch(venue: string, candidate: string): "exact" | "contains" | "none" {
  const a = words(venue), b = words(candidate);
  if (a.length === 0 || b.length === 0) return "none";
  if (a.join(" ") === b.join(" ")) return "exact";
  const contains = (outer: string[], inner: string[]) => outer.join(" ").includes(inner.join(" ")) && inner.every((w) => outer.includes(w));
  return contains(b, a) || contains(a, b) ? "contains" : "none";
}

/** The venue's name and a candidate's agree when one's words are all in the other's, in order. */
export const sameName = (venue: string, candidate: string): boolean => nameMatch(venue, candidate) !== "none";

/** The first part of "Jubilee Hills, Hyderabad": the neighbourhood, which is what tells two branches of a chain apart. */
const neighbourhood = (locality: string): string => fold(locality.split(",")[0] ?? "");

/**
 * The candidate that is the venue: its name the venue's — exactly, or containing it when the
 * service says what kind of place it is, since a bare lookalike name is a clinic and not a café —
 * and, among several, the one whose address names the venue's neighbourhood, so a chain resolves
 * to the branch the post meant and not the first branch the service lists.
 */
export function pickCandidate(venue: Venue, candidates: Candidate[]): Candidate | null {
  const area = neighbourhood(venue.locality);
  let best: { candidate: Candidate; score: number } | null = null;
  for (const c of candidates) {
    const match = nameMatch(venue.name, c.name);
    if (match === "none" || (match === "contains" && c.category === null)) continue;
    const here = area.length > 0 && fold(`${c.address ?? ""} ${c.locality ?? ""}`).includes(area) ? 1 : 0;
    const score = (match === "exact" ? 2 : 1) + here * 2;
    if (!best || score > best.score) best = { candidate: c, score };
  }
  return best?.candidate ?? null;
}

export const venueQuery = (venue: Venue): string => `${venue.name}, ${venue.locality}`;

/**
 * Google first, Apple when Google has nothing that matches or is not configured. A provider that
 * is down is skipped; both down is its own reason, so the row is tried again rather than marked a
 * miss.
 */
export async function resolveVenue(venue: Venue, deps: PlacesDeps): Promise<Resolution> {
  const query = venueQuery(venue);
  let unreachable = 0;
  const providers: (((q: string) => Promise<Candidate[]>) | null)[] = [deps.google, deps.apple];
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
    // A line Apple breaks with newlines is one address, read on one line.
    const lines = Array.isArray(o["formattedAddressLines"]) ? (o["formattedAddressLines"] as unknown[]).filter((l): l is string => typeof l === "string").flatMap((l) => l.split(/\s*\n\s*/)).map((l) => l.trim()).filter((l) => l.length > 0) : [];
    const structured = o["structuredAddress"] as { locality?: unknown } | undefined;
    return [{
      provider: "apple",
      providerId: typeof o["id"] === "string" ? o["id"] : `${lat},${lng}`,
      name: o["name"],
      address: lines.length > 0 ? lines.join(", ") : null,
      locality: typeof structured?.locality === "string" ? structured.locality : null,
      lat, lng,
      category: typeof o["poiCategory"] === "string" ? o["poiCategory"] : null,
      hours: null, status: null, url: null, periods: null, utcOffsetMinutes: null,
    }];
  });
}

/** A point in the week as Google writes it, or nothing: a period with a malformed point is no period. */
function openingPoint(v: unknown): OpeningPoint | null {
  const o = v as Record<string, unknown> | null | undefined;
  const day = o?.["day"], hour = o?.["hour"], minute = o?.["minute"];
  if (typeof day !== "number" || day < 0 || day > 6) return null;
  return { day, hour: typeof hour === "number" ? hour : 0, minute: typeof minute === "number" ? minute : 0 };
}

/** Google's periods, read defensively: an open without a close is a place open around the clock, which Google writes exactly so. */
function openingPeriods(v: unknown): OpeningPeriod[] | null {
  if (!Array.isArray(v)) return null;
  const periods = v.flatMap((p): OpeningPeriod[] => {
    const open = openingPoint((p as Record<string, unknown> | null)?.["open"]);
    if (!open) return [];
    const close = openingPoint((p as Record<string, unknown>)["close"]);
    return [close ? { open, close } : { open }];
  });
  return periods.length > 0 ? periods : null;
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
    const opening = o["regularOpeningHours"] as { weekdayDescriptions?: unknown; periods?: unknown } | undefined;
    const hours = opening?.weekdayDescriptions;
    return [{
      provider: "google",
      providerId: o["id"],
      name,
      address: typeof o["formattedAddress"] === "string" ? o["formattedAddress"] : null,
      locality: localityOf(o["addressComponents"]),
      lat: loc.latitude, lng: loc.longitude,
      category: typeof o["primaryType"] === "string" ? o["primaryType"] : null,
      hours: Array.isArray(hours) ? hours.filter((h): h is string => typeof h === "string") : null,
      status: typeof o["businessStatus"] === "string" ? o["businessStatus"] : null,
      url: typeof o["googleMapsUri"] === "string" ? o["googleMapsUri"] : null,
      periods: openingPeriods(opening?.periods),
      utcOffsetMinutes: typeof o["utcOffsetMinutes"] === "number" ? o["utcOffsetMinutes"] : null,
    }];
  });
}

/**
 * The town a place is in, from Google's address components: the locality when Google names one,
 * else the next level up — some towns are filed under their district — and never the country.
 */
function localityOf(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  const named = (type: string): string | null => {
    const hit = components.find((c) => Array.isArray((c as { types?: unknown })?.types) && ((c as { types: unknown[] }).types).includes(type));
    const text = (hit as { longText?: unknown } | undefined)?.longText;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  };
  return named("locality") ?? named("postal_town") ?? named("administrative_area_level_3") ?? named("administrative_area_level_2") ?? null;
}

/** The arguments of place_resolved(), built in one place for the sweeper and the resolve door alike. */
export function placeResolvedArgs(itemId: string, p: Candidate): Record<string, unknown> {
  return {
    p_item_id: itemId, p_provider: p.provider, p_provider_id: p.providerId, p_name: p.name, p_address: p.address, p_locality: p.locality,
    p_lat: p.lat, p_lng: p.lng, p_category: p.category, p_hours: p.hours, p_status: p.status, p_url: p.url,
    p_periods: p.periods, p_utc_offset_minutes: p.utcOffsetMinutes,
  };
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

/** A place as the refresh pass takes it: enough to look it up again by its own name. */
export interface PlaceToRefresh {
  id: string; provider: string; providerId: string; name: string; locality: string | null;
  /** The locality of the venue a save wrote for this place — the words that found it in the first place. */
  venueLocality: string | null;
  address: string | null;
}

/**
 * The venue to look a known place up by: its name with its town; failing that the words that
 * found it, since a search by those is known to work; failing that its address, which Google can
 * choke on when it is long. Nothing to search by is nothing to refresh.
 */
export function refreshQuery(place: { name: string; locality: string | null; venueLocality: string | null; address: string | null }): Venue | null {
  const locality = place.locality?.trim() || place.venueLocality?.trim() || place.address?.trim() || "";
  return place.name.trim() && locality ? { name: place.name.trim(), locality } : null;
}

export interface RefreshPassDeps {
  /** Places whose facts are old or missing, oldest first, up to the limit. */
  rows(limit: number): Promise<PlaceToRefresh[]>;
  resolve(venue: Venue): Promise<Resolution>;
  /** Writes the fields given onto the place. */
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

/**
 * The liveness pass: a place is looked up again by its own name now and then, so a closure, new
 * hours or a town it lacked catch up. What comes back replaces the place's facts only when it is
 * the same place by name; a place not found this time is left as it was, dated so it is not asked
 * again every sweep — nothing is invented about it. One place's failure never the batch's.
 */
export async function runRefreshPass(deps: RefreshPassDeps, limit: number): Promise<{ rows: number; refreshed: number; unchanged: number; failed: number }> {
  const rows = await deps.rows(limit);
  const out = { rows: rows.length, refreshed: 0, unchanged: 0, failed: 0 };
  for (const row of rows) {
    try {
      const venue = refreshQuery(row);
      const found = venue ? (await deps.resolve(venue)).place : null;
      const same = found && sameName(row.name, found.name) ? found : null;
      if (same) {
        await deps.update(row.id, {
          provider: same.provider, provider_id: same.providerId, name: same.name, address: same.address, locality: same.locality ?? row.locality,
          lat: same.lat, lng: same.lng, category: same.category, hours: same.hours, status: same.status, url: same.url,
          periods: same.periods, utc_offset_minutes: same.utcOffsetMinutes, resolved_at: new Date().toISOString(),
        });
        out.refreshed++;
      } else {
        await deps.update(row.id, { resolved_at: new Date().toISOString() });
        out.unchanged++;
      }
    } catch (e) {
      out.failed++;
      deps.log("refresh: place failed", { place: row.id, error: String(e).slice(0, 200) });
    }
  }
  return out;
}

// The two places services, as the resolver asks them: a query in, candidates out.
//
// Apple's Maps Server API takes a short-lived access token, exchanged for a JWT we sign with the
// Maps key (ES256) — kept here for its half hour and refreshed early. Google's Places API takes
// the key on each request and a field mask naming exactly what we read, which is what we pay for.
// Both read their answers through places.ts, so a change of shape breaks one test, not a sweep.
import { importPKCS8, SignJWT } from "npm:jose@5";
import { appleFromSearch, googleFromSearch, type Candidate } from "./places.ts";

export interface AppleMapsConfig { teamId: string; keyId: string; privateKey: string; mapsId: string | null }

type Fetch = typeof fetch;

/** Apple: an access token from a signed JWT, good for its stated seconds; asked again a minute before it lapses. */
export function appleMaps(config: AppleMapsConfig, fetchFn: Fetch = fetch, now: () => number = Date.now) {
  let cached: { token: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.until > now() + 60_000) return cached.token;
    const key = await importPKCS8(config.privateKey, "ES256");
    const issued = Math.floor(now() / 1000);
    let jwt = new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: config.keyId, typ: "JWT" }).setIssuer(config.teamId).setIssuedAt(issued).setExpirationTime(issued + 30 * 60);
    if (config.mapsId) jwt = jwt.setSubject(config.mapsId);
    const signed = await jwt.sign(key);
    const res = await fetchFn("https://maps-api.apple.com/v1/token", { headers: { Authorization: `Bearer ${signed}` } });
    if (!res.ok) throw new Error(`apple token ${res.status}`);
    const body = await res.json() as { accessToken?: unknown; expiresInSeconds?: unknown };
    if (typeof body.accessToken !== "string") throw new Error("apple token: no accessToken");
    const seconds = typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : 1800;
    cached = { token: body.accessToken, until: now() + seconds * 1000 };
    return cached.token;
  }

  return async function search(query: string): Promise<Candidate[]> {
    const token = await accessToken();
    const url = `https://maps-api.apple.com/v1/search?q=${encodeURIComponent(query)}&lang=en-IN&resultTypeFilter=Poi`;
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`apple search ${res.status}`);
    return appleFromSearch(await res.json());
  };
}

/** Google: Text Search (New), asking for the fields the resolver reads and no more. */
export function googlePlaces(apiKey: string, fetchFn: Fetch = fetch) {
  return async function search(query: string): Promise<Candidate[]> {
    const res = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.businessStatus,places.regularOpeningHours.weekdayDescriptions,places.regularOpeningHours.periods,places.utcOffsetMinutes,places.addressComponents,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "en", maxResultCount: 3 }),
    });
    if (!res.ok) throw new Error(`google search ${res.status}`);
    return googleFromSearch(await res.json());
  };
}

/** The providers as the environment configures them: Apple when its four values are set, Google when its key is. */
export function providersFromEnv(get: (name: string) => string | undefined, fetchFn: Fetch = fetch): { apple: ((q: string) => Promise<Candidate[]>) | null; google: ((q: string) => Promise<Candidate[]>) | null } {
  const teamId = get("APPLE_MAPS_TEAM_ID")?.trim(), keyId = get("APPLE_MAPS_KEY_ID")?.trim(), privateKey = get("APPLE_MAPS_PRIVATE_KEY")?.trim();
  const apple = teamId && keyId && privateKey ? appleMaps({ teamId, keyId, privateKey, mapsId: get("APPLE_MAPS_ID")?.trim() || null }, fetchFn) : null;
  const googleKey = get("GOOGLE_PLACES_API_KEY")?.trim();
  return { apple, google: googleKey ? googlePlaces(googleKey, fetchFn) : null };
}

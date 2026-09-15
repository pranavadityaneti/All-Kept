import { assertEquals } from "jsr:@std/assert@1";
import { appleMaps, googlePlaces, providersFromEnv } from "../_shared/place-providers.ts";

// A throwaway P-256 key, generated for this test and nothing else.
const TEST_P8 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTfgjwDHAbbNZU5jl
cAByQB8QVxzWqIH5+ZrAcdqeyr6hRANCAAS8SHf8tW19Zi8BQFLYOzdVNVtleosG
OnoMLfPA+kQ5vlufaw58A3UvL2ItSVzB6N7cElPlsr2ON/s7aXwhWul/
-----END PRIVATE KEY-----`;

Deno.test("Apple: one signed token exchange, reused for its half hour, then the search with it", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  let clock = 1_000_000_000_000;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: (init?.headers as Record<string, string>)?.["Authorization"] ?? null });
    if (url.endsWith("/v1/token")) return new Response(JSON.stringify({ accessToken: "ACCESS", expiresInSeconds: 1800 }));
    return new Response(JSON.stringify({ results: [{ name: "Haku", coordinate: { latitude: 19.06, longitude: 72.83 }, poiCategory: "Restaurant", formattedAddressLines: ["Bandra"] }] }));
  }) as typeof fetch;
  const search = appleMaps({ teamId: "TEAM", keyId: "KEY", privateKey: TEST_P8, mapsId: "maps.app.allkept.mobile" }, fetchFn, () => clock);
  const first = await search("Haku, Bandra");
  assertEquals(first.map((c) => [c.name, c.category]), [["Haku", "Restaurant"]]);
  clock += 10 * 60_000;
  await search("Olive, Bandra");
  // One token exchange served both searches; each search carried the access token, not the JWT.
  assertEquals(calls.map((c) => c.url.includes("/v1/token") ? "token" : "search"), ["token", "search", "search"]);
  assertEquals(calls[1]!.auth, "Bearer ACCESS");
  assertEquals(calls[0]!.auth?.startsWith("Bearer eyJ"), true);
  assertEquals(decodeURIComponent(calls[1]!.url).includes("q=Haku, Bandra"), true);
  // Past its life, the token is exchanged again.
  clock += 25 * 60_000;
  await search("Haku, Bandra");
  assertEquals(calls.filter((c) => c.url.includes("/v1/token")).length, 2);
});

Deno.test("Google: the key and the field mask on every search; a refusal is an error the resolver treats as the provider being down", async () => {
  let seen: RequestInit | undefined;
  const ok = (async (_: string | URL | Request, init?: RequestInit) => { seen = init; return new Response(JSON.stringify({ places: [] })); }) as typeof fetch;
  await googlePlaces("KEY", ok)("Haku, Bandra");
  const headers = seen!.headers as Record<string, string>;
  assertEquals(headers["X-Goog-Api-Key"], "KEY");
  assertEquals(headers["X-Goog-FieldMask"].includes("places.location"), true);
  assertEquals(JSON.parse(String(seen!.body)), { textQuery: "Haku, Bandra", languageCode: "en", maxResultCount: 3 });
  const refused = (async () => new Response("no", { status: 403 })) as typeof fetch;
  let error = "";
  try { await googlePlaces("KEY", refused)("x"); } catch (e) { error = String(e); }
  assertEquals(error.includes("403"), true);
});

Deno.test("the providers follow the environment: Apple needs its three values, Google its key", () => {
  const none = providersFromEnv(() => undefined);
  assertEquals([none.apple, none.google], [null, null]);
  const both = providersFromEnv((n) => ({ APPLE_MAPS_TEAM_ID: "T", APPLE_MAPS_KEY_ID: "K", APPLE_MAPS_PRIVATE_KEY: TEST_P8, GOOGLE_PLACES_API_KEY: "G" })[n]);
  assertEquals([typeof both.apple, typeof both.google], ["function", "function"]);
  const partial = providersFromEnv((n) => ({ APPLE_MAPS_TEAM_ID: "T", GOOGLE_PLACES_API_KEY: "G" })[n]);
  assertEquals([partial.apple, typeof partial.google], [null, "function"]);
});

import { assertEquals } from "jsr:@std/assert@1";
import { appleFromSearch, googleFromSearch, pickCandidate, placeResolvedArgs, resolveVenue, runPlacesPass, sameName, type Candidate, type PlacesDeps } from "../_shared/places.ts";

const haku = { name: "Haku", locality: "Bandra, Mumbai" };
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  provider: "apple", providerId: "a1", name: "Haku", address: "Linking Road, Bandra West, Mumbai 400050", locality: "Mumbai",
  lat: 19.06, lng: 72.83, category: "Restaurant", hours: null, status: null, url: null, periods: null, utcOffsetMinutes: null, ...over,
});

Deno.test("a candidate is the venue when the names agree, ignoring case, accents and punctuation, or one contains the other", () => {
  assertEquals(sameName("Haku", "HAKU"), true);
  assertEquals(sameName("Café Delhi Heights", "Cafe Delhi Heights - Saket"), true);
  assertEquals(sameName("The Bombay Canteen", "Bombay Canteen"), true);
  assertEquals(sameName("Haku", "Hakuna Matata Lounge"), false);
  assertEquals(sameName("Olive", "Olive Bar & Kitchen"), true);
  assertEquals(sameName("Blue Tokai", "Third Wave Coffee"), false);
});

Deno.test("the candidate that is a place with the venue's name wins; a city or a street with a lookalike name does not", () => {
  const results = [candidate({ name: "Haku Street", category: null }), candidate({ name: "Haku", providerId: "a2" }), candidate({ name: "Haku", providerId: "a3" })];
  assertEquals(pickCandidate(haku, results)?.providerId, "a2");
  assertEquals(pickCandidate(haku, [candidate({ name: "Bandra" })]), null);
  assertEquals(pickCandidate(haku, []), null);
  // Apple sometimes knows a venue without saying what kind: an exact name is taken without a category,
  // but a name that merely contains the venue's is not — "Hakh Unani Wellness Centre" is not Haku.
  assertEquals(pickCandidate({ name: "Olive Bar & Kitchen", locality: "Bandra, Mumbai" }, [candidate({ name: "Olive Bar & Kitchen", category: null, providerId: "o1" })])?.providerId, "o1");
  assertEquals(pickCandidate(haku, [candidate({ name: "Hakuna Matata Haku Lounge", category: null })]), null);
});

Deno.test("a chain resolves to the branch in the venue's locality, not the first branch the service lists", () => {
  const venue = { name: "Blue Tokai Coffee", locality: "Jubilee Hills, Hyderabad" };
  const branches = [
    candidate({ name: "Blue Tokai Coffee Roasters", providerId: "madhapur", address: "41, Jubilee Enclave, Madhapur, Hyderabad, 500081", category: "Cafe" }),
    candidate({ name: "Blue Tokai Coffee Roasters", providerId: "jubilee", address: "Road No 36, Jubilee Hills, Hyderabad, 500033", category: "Cafe" }),
    candidate({ name: "Blue Tokai Coffee Roasters", providerId: "banjara", address: "Road No 12, Banjara Hills, Hyderabad", category: "Cafe" }),
  ];
  assertEquals(pickCandidate(venue, branches)?.providerId, "jubilee");
  // With no branch in the locality, the first that matches by name still stands.
  assertEquals(pickCandidate(venue, [branches[0]!, branches[2]!])?.providerId, "madhapur");
});

Deno.test("Google answers first, since it knows the hours; Apple when Google has nothing that matches; nothing when neither does, with the reason kept", async () => {
  const asked: string[] = [];
  const deps: PlacesDeps = {
    apple: async (q) => { asked.push(`apple:${q}`); return [candidate()]; },
    google: async (q) => { asked.push(`google:${q}`); return [candidate({ provider: "google", providerId: "g1" })]; },
  };
  const first = await resolveVenue(haku, deps);
  assertEquals([first.place?.provider, first.place?.providerId, asked], ["google", "g1", ["google:Haku, Bandra, Mumbai"]]);
  const noGoogle: PlacesDeps = { apple: deps.apple, google: async () => [candidate({ provider: "google", name: "Bandra" })] };
  assertEquals((await resolveVenue(haku, noGoogle)).place?.provider, "apple");
  const nobody: PlacesDeps = { apple: async () => [], google: async () => [] };
  assertEquals(await resolveVenue(haku, nobody), { place: null, reason: "no match" });
  // A provider that is down is skipped, not fatal; the other still answers.
  const googleDown: PlacesDeps = { apple: deps.apple, google: async () => { throw new Error("429"); } };
  assertEquals((await resolveVenue(haku, googleDown)).place?.provider, "apple");
  const bothDown: PlacesDeps = { apple: async () => { throw new Error("503"); }, google: async () => { throw new Error("429"); } };
  assertEquals(await resolveVenue(haku, bothDown), { place: null, reason: "providers unreachable" });
  // No Google key: Apple alone, and its miss is a miss.
  const appleOnly: PlacesDeps = { apple: async () => [], google: null };
  assertEquals(await resolveVenue(haku, appleOnly), { place: null, reason: "no match" });
});

Deno.test("Apple's and Google's answers are read into one shape", () => {
  const apple = appleFromSearch({ results: [{
    name: "Haku", coordinate: { latitude: 19.0596, longitude: 72.8295 }, formattedAddressLines: ["Linking Road", "Bandra West", "Mumbai 400050", "India"],
    structuredAddress: { locality: "Mumbai", subLocality: "Bandra West" }, poiCategory: "Restaurant", id: "I123",
  }, { name: "Bandra", coordinate: { latitude: 19.05, longitude: 72.84 }, formattedAddressLines: ["Mumbai"] },
  { name: "The Bombay Canteen", coordinate: { latitude: 19.0032, longitude: 72.8275 }, formattedAddressLines: ["Process House\nUnit 1\nS.B. Road", "Lower Parel"], poiCategory: "Restaurant" }] });
  assertEquals(apple.map((c) => [c.provider, c.providerId, c.name, c.address, c.locality, c.lat, c.lng, c.category]), [
    ["apple", "I123", "Haku", "Linking Road, Bandra West, Mumbai 400050, India", "Mumbai", 19.0596, 72.8295, "Restaurant"],
    ["apple", "19.05,72.84", "Bandra", "Mumbai", null, 19.05, 72.84, null],
    // A line Apple breaks with newlines is one address, read on one line.
    ["apple", "19.0032,72.8275", "The Bombay Canteen", "Process House, Unit 1, S.B. Road, Lower Parel", null, 19.0032, 72.8275, "Restaurant"],
  ]);
  const google = googleFromSearch({ places: [{
    id: "ChIJ1", displayName: { text: "Haku" }, formattedAddress: "Linking Rd, Bandra West, Mumbai, Maharashtra 400050, India",
    location: { latitude: 19.0596, longitude: 72.8295 }, primaryType: "japanese_restaurant", businessStatus: "OPERATIONAL",
    regularOpeningHours: { weekdayDescriptions: ["Monday: 12:00 – 11:00 PM"], periods: [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } }] },
    utcOffsetMinutes: 330, googleMapsUri: "https://maps.google.com/?cid=1",
  }, { id: "ChIJ2", displayName: { text: "Nowhere" }, location: { latitude: 1, longitude: 2 } }] });
  assertEquals(google.map((c) => [c.provider, c.providerId, c.name, c.category, c.status, c.hours, c.url, c.periods, c.utcOffsetMinutes]), [
    ["google", "ChIJ1", "Haku", "japanese_restaurant", "OPERATIONAL", ["Monday: 12:00 – 11:00 PM"], "https://maps.google.com/?cid=1", [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } }], 330],
    // A place Google knows nothing more about: the hours and the clock are simply absent, never invented.
    ["google", "ChIJ2", "Nowhere", null, null, null, null, null, null],
  ]);
  assertEquals(apple[0]!.periods, null);
  assertEquals(appleFromSearch({}), []);
  assertEquals(googleFromSearch({ places: "nope" }), []);
  // One helper builds the write for both the sweeper and the resolve door, so a new column is never added on one side only.
  const args = placeResolvedArgs("item-1", google[0]!);
  assertEquals(args["p_item_id"], "item-1");
  assertEquals(args["p_periods"], google[0]!.periods);
  assertEquals(args["p_utc_offset_minutes"], 330);
  assertEquals(Object.keys(args).sort(), ["p_address", "p_category", "p_hours", "p_item_id", "p_lat", "p_lng", "p_locality", "p_name", "p_periods", "p_provider", "p_provider_id", "p_status", "p_url", "p_utc_offset_minutes"]);
});

Deno.test("the pass resolves a bounded batch, saves a place or records the miss, and never lets one row fail the rest", async () => {
  const saved: unknown[] = [];
  const outcome = await runPlacesPass({
    rows: async (limit) => [{ itemId: "i1", venue: haku }, { itemId: "i2", venue: { name: "Nowhere", locality: "Nowhere" } }, { itemId: "i3", venue: haku }].slice(0, limit),
    resolve: async (venue) => venue.name === "Nowhere" ? { place: null, reason: "no match" } : { place: candidate(), reason: null },
    save: async (itemId, result) => { if (itemId === "i3") throw new Error("db down"); saved.push([itemId, result.place?.providerId ?? result.reason]); },
    log: () => {},
  }, 10);
  assertEquals(saved, [["i1", "a1"], ["i2", "no match"]]);
  // The third row resolved but could not be saved: it counts as failed, not resolved, and is tried again next sweep.
  assertEquals(outcome, { rows: 3, resolved: 1, unresolved: 1, failed: 1 });
});

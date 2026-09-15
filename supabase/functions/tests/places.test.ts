import { assertEquals } from "jsr:@std/assert@1";
import { appleFromSearch, googleFromSearch, pickCandidate, resolveVenue, runPlacesPass, sameName, type Candidate, type PlacesDeps } from "../_shared/places.ts";

const haku = { name: "Haku", locality: "Bandra, Mumbai" };
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  provider: "apple", providerId: "a1", name: "Haku", address: "Linking Road, Bandra West, Mumbai 400050", locality: "Mumbai",
  lat: 19.06, lng: 72.83, category: "Restaurant", hours: null, status: null, url: null, ...over,
});

Deno.test("a candidate is the venue when the names agree, ignoring case, accents and punctuation, or one contains the other", () => {
  assertEquals(sameName("Haku", "HAKU"), true);
  assertEquals(sameName("Café Delhi Heights", "Cafe Delhi Heights - Saket"), true);
  assertEquals(sameName("The Bombay Canteen", "Bombay Canteen"), true);
  assertEquals(sameName("Haku", "Hakuna Matata Lounge"), false);
  assertEquals(sameName("Olive", "Olive Bar & Kitchen"), true);
  assertEquals(sameName("Blue Tokai", "Third Wave Coffee"), false);
});

Deno.test("the first candidate that is a place with the venue's name wins; a city or a street with a lookalike name does not", () => {
  const results = [candidate({ name: "Haku Street", category: null }), candidate({ name: "Haku", providerId: "a2" }), candidate({ name: "Haku", providerId: "a3" })];
  assertEquals(pickCandidate(haku, results)?.providerId, "a2");
  assertEquals(pickCandidate(haku, [candidate({ name: "Bandra" })]), null);
  assertEquals(pickCandidate(haku, []), null);
});

Deno.test("Apple answers first; Google only when Apple has nothing that matches; nothing when neither does, with the reason kept", async () => {
  const asked: string[] = [];
  const deps: PlacesDeps = {
    apple: async (q) => { asked.push(`apple:${q}`); return [candidate()]; },
    google: async (q) => { asked.push(`google:${q}`); return [candidate({ provider: "google", providerId: "g1" })]; },
  };
  const first = await resolveVenue(haku, deps);
  assertEquals([first.place?.provider, first.place?.providerId, asked], ["apple", "a1", ["apple:Haku, Bandra, Mumbai"]]);
  const noApple: PlacesDeps = { apple: async () => [candidate({ name: "Bandra" })], google: deps.google };
  assertEquals((await resolveVenue(haku, noApple)).place?.provider, "google");
  const nobody: PlacesDeps = { apple: async () => [], google: async () => [] };
  assertEquals(await resolveVenue(haku, nobody), { place: null, reason: "no match" });
  // A provider that is down is skipped, not fatal; the other still answers.
  const appleDown: PlacesDeps = { apple: async () => { throw new Error("503"); }, google: deps.google };
  assertEquals((await resolveVenue(haku, appleDown)).place?.provider, "google");
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
  }, { name: "Bandra", coordinate: { latitude: 19.05, longitude: 72.84 }, formattedAddressLines: ["Mumbai"] }] });
  assertEquals(apple.map((c) => [c.provider, c.providerId, c.name, c.address, c.locality, c.lat, c.lng, c.category]), [
    ["apple", "I123", "Haku", "Linking Road, Bandra West, Mumbai 400050, India", "Mumbai", 19.0596, 72.8295, "Restaurant"],
    ["apple", "19.05,72.84", "Bandra", "Mumbai", null, 19.05, 72.84, null],
  ]);
  const google = googleFromSearch({ places: [{
    id: "ChIJ1", displayName: { text: "Haku" }, formattedAddress: "Linking Rd, Bandra West, Mumbai, Maharashtra 400050, India",
    location: { latitude: 19.0596, longitude: 72.8295 }, primaryType: "japanese_restaurant", businessStatus: "OPERATIONAL",
    regularOpeningHours: { weekdayDescriptions: ["Monday: 12:00 – 11:00 PM"] }, googleMapsUri: "https://maps.google.com/?cid=1",
  }] });
  assertEquals(google.map((c) => [c.provider, c.providerId, c.name, c.category, c.status, c.hours, c.url]), [
    ["google", "ChIJ1", "Haku", "japanese_restaurant", "OPERATIONAL", ["Monday: 12:00 – 11:00 PM"], "https://maps.google.com/?cid=1"],
  ]);
  assertEquals(appleFromSearch({}), []);
  assertEquals(googleFromSearch({ places: "nope" }), []);
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

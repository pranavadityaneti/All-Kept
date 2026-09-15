import { assertEquals } from "jsr:@std/assert@1";
import { handleResolvePlace, venueFromWords, type ResolvePlaceDeps } from "../resolve-place/handler.ts";
import type { Candidate } from "../_shared/places.ts";

const ID = "98c71d8f-0000-4000-8000-000000000001";
const request = (body: unknown, method = "POST") => new Request("https://example.test/resolve-place", { method, body: method === "POST" ? JSON.stringify(body) : null });
const doppler: Candidate = { provider: "google", providerId: "g1", name: "Doppler Coffee", address: "C-Scheme, Jaipur, Rajasthan 302001, India", locality: null, lat: 26.91, lng: 75.79, category: "cafe", hours: null, status: "OPERATIONAL", url: null, periods: null, utcOffsetMinutes: null, rating: null, ratingCount: null, priceLevel: null };

function fake(over: Partial<ResolvePlaceDeps> = {}) {
  const written: unknown[] = []; const cleared: string[] = [];
  const deps: ResolvePlaceDeps = {
    userId: async () => "u1",
    owned: async () => true,
    resolve: async () => ({ place: doppler, reason: null }),
    write: async (itemId, venue, place, miss) => { written.push({ itemId, venue, place: place?.providerId ?? null, miss }); },
    clear: async (itemId) => { cleared.push(itemId); },
    ...over,
  };
  return { deps, written, cleared };
}

Deno.test("the person's words are looked up at once and kept with the place found", async () => {
  const f = fake();
  const r = await handleResolvePlace(request({ itemId: ID, name: " Doppler  Coffee ", locality: "Jaipur" }), f.deps);
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.venue, { name: "Doppler Coffee", locality: "Jaipur" });
  assertEquals([j.place.name, j.place.lat, j.place.status], ["Doppler Coffee", 26.91, "OPERATIONAL"]);
  assertEquals(f.written, [{ itemId: ID, venue: { name: "Doppler Coffee", locality: "Jaipur" }, place: "g1", miss: null }]);
});

Deno.test("a miss keeps the words and records it; the maps being down is said, and nothing is written", async () => {
  const miss = fake({ resolve: async () => ({ place: null, reason: "no match" }) });
  const r = await handleResolvePlace(request({ itemId: ID, name: "Nowhere Café", locality: "Jaipur" }), miss.deps);
  assertEquals((await r.json()).place, null);
  assertEquals(miss.written, [{ itemId: ID, venue: { name: "Nowhere Café", locality: "Jaipur" }, place: null, miss: "no match" }]);
  const down = fake({ resolve: async () => ({ place: null, reason: "providers unreachable" }) });
  assertEquals((await handleResolvePlace(request({ itemId: ID, name: "Doppler Coffee", locality: "Jaipur" }), down.deps)).status, 503);
  assertEquals(down.written, []);
});

Deno.test("clearing takes the person's place away and leaves the sorter's to be looked up again", async () => {
  const f = fake({ resolve: async () => { throw new Error("must not look up"); } });
  assertEquals((await handleResolvePlace(request({ itemId: ID, clear: true }), f.deps)).status, 200);
  assertEquals(f.cleared, [ID]);
});

Deno.test("only the owner, signed in, with a save and two words; the words are what a person types, bounded", async () => {
  assertEquals((await handleResolvePlace(request({ itemId: ID, name: "x", locality: "y" }, "GET"), fake().deps)).status, 400);
  assertEquals((await handleResolvePlace(request({ itemId: ID, name: "Doppler", locality: "Jaipur" }), fake({ userId: async () => null }).deps)).status, 401);
  assertEquals((await handleResolvePlace(request({ itemId: ID, name: "Doppler", locality: "Jaipur" }), fake({ owned: async () => false }).deps)).status, 404);
  assertEquals((await handleResolvePlace(request({ itemId: "nope", name: "Doppler", locality: "Jaipur" }), fake().deps)).status, 400);
  assertEquals((await handleResolvePlace(request({ itemId: ID, name: "D", locality: "Jaipur" }), fake().deps)).status, 400);
  assertEquals(venueFromWords("  Doppler   Coffee ", "Jaipur "), { name: "Doppler Coffee", locality: "Jaipur" });
  assertEquals(venueFromWords("x".repeat(81), "Jaipur"), null);
  assertEquals(venueFromWords("Doppler", ""), null);
});

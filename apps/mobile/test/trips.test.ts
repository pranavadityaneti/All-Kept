import { describe, expect, it } from "vitest";
import { googleDirectionsUrl, itineraryText, tripsFrom, type TripStop } from "../lib/trips";

const stop = (over: Partial<TripStop> & { id: string; locality: string | null }): TripStop => ({
  title: `Save ${over.id}`, url: `https://www.instagram.com/reel/${over.id}/`, lastSavedAt: "2026-09-15T10:00:00Z",
  place: { name: `Place ${over.id}`, address: `${over.id} Street`, lat: 17.4, lng: 78.4, status: null, url: null, periods: null, utcOffsetMinutes: null, locality: over.locality },
  ...over,
});

describe("trips, gathered by town", () => {
  it("groups the places by their town, most places first, with the newest save's town breaking a tie; places without a town gather at the end", () => {
    const trips = tripsFrom([
      stop({ id: "a", locality: "Weligama" }), stop({ id: "b", locality: "Kyoto", lastSavedAt: "2026-09-14T10:00:00Z" }),
      stop({ id: "c", locality: "Weligama" }), stop({ id: "d", locality: null }), stop({ id: "e", locality: "Tokyo", lastSavedAt: "2026-09-16T10:00:00Z" }),
    ]);
    expect(trips.map((t) => [t.town, t.stops.map((s) => s.id)])).toEqual([
      ["Weligama", ["a", "c"]], ["Tokyo", ["e"]], ["Kyoto", ["b"]], ["Elsewhere", ["d"]],
    ]);
  });
  it("is nothing without places", () => {
    expect(tripsFrom([])).toEqual([]);
  });
});

describe("the ways out of a trip", () => {
  const stops = [
    stop({ id: "a", locality: "Weligama", place: { name: "The Cliff", address: "Kapparathota, Weligama", lat: 5.97, lng: 80.42, status: null, url: null, periods: null, utcOffsetMinutes: null, locality: "Weligama" } }),
    stop({ id: "b", locality: "Weligama", place: { name: "Cape Weligama", address: "Abimanagama Rd, Weligama", lat: 5.96, lng: 80.40, status: "OPERATIONAL", url: null, periods: [{ open: { day: 0, hour: 0, minute: 0 } }], utcOffsetMinutes: 330, locality: "Weligama" } }),
  ];
  it("opens every stop in Google Maps as one route, first to last, the rest as waypoints", () => {
    expect(googleDirectionsUrl(stops)).toBe("https://www.google.com/maps/dir/?api=1&origin=5.97%2C80.42&destination=5.96%2C80.4&travelmode=driving");
    const three = [...stops, stop({ id: "c", locality: "Weligama", place: { ...stops[0]!.place, name: "Third", lat: 5.95, lng: 80.41 } })];
    expect(googleDirectionsUrl(three)).toBe("https://www.google.com/maps/dir/?api=1&origin=5.97%2C80.42&destination=5.95%2C80.41&waypoints=5.96%2C80.4&travelmode=driving");
    expect(googleDirectionsUrl([stops[0]!])).toBe("https://www.google.com/maps/dir/?api=1&destination=5.97%2C80.42&travelmode=driving");
    expect(googleDirectionsUrl([])).toBeNull();
  });
  it("writes the itinerary a person can send: the town, each place with its address and hours, and the save it came from", () => {
    const text = itineraryText("Weligama", stops, new Date("2026-09-15T09:00:00Z"));
    expect(text).toBe([
      "Weligama — 2 places saved in Allkept",
      "",
      "1. The Cliff",
      "   Kapparathota, Weligama",
      "   From: Save a — https://www.instagram.com/reel/a/",
      "",
      "2. Cape Weligama",
      "   Abimanagama Rd, Weligama",
      "   Open 24 hours",
      "   From: Save b — https://www.instagram.com/reel/b/",
    ].join("\n"));
  });
});

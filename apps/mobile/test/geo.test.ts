import { describe, expect, it } from "vitest";
import { distanceKm, distanceWord, nearby } from "../lib/geo";

const cemnt = { lat: 17.4325, lng: 78.4071 };
const doppler = { lat: 26.9124, lng: 75.7873 };

describe("how far a place is", () => {
  it("measures along the earth, not across a flat map", () => {
    // CEMNT to Doppler Coffee, Hyderabad to Jaipur: about 1,090 km as the crow flies.
    expect(distanceKm(cemnt, doppler)).toBeGreaterThan(1080);
    expect(distanceKm(cemnt, doppler)).toBeLessThan(1100);
    expect(distanceKm(cemnt, cemnt)).toBe(0);
  });
  it("says it the way a person would: metres up close, a decimal below ten, whole kilometres beyond", () => {
    expect(distanceWord(0.04)).toBe("40 m");
    expect(distanceWord(0.75)).toBe("750 m");
    expect(distanceWord(1.24)).toBe("1.2 km");
    expect(distanceWord(9.96)).toBe("10 km");
    expect(distanceWord(23.4)).toBe("23 km");
    expect(distanceWord(1090)).toBe("1,090 km");
  });
});

describe("what is near", () => {
  it("keeps the places within reach, nearest first, each with its distance", () => {
    const here = { lat: 17.44, lng: 78.40 };
    const places = [
      { id: "far", place: doppler },
      { id: "cemnt", place: cemnt },
      { id: "closer", place: { lat: 17.441, lng: 78.401 } },
    ];
    expect(nearby(places, here, 5).map((n) => [n.id, n.km < 2])).toEqual([["closer", true], ["cemnt", true]]);
    expect(nearby(places, here, 0.5).map((n) => n.id)).toEqual(["closer"]);
    expect(nearby(places, null, 5)).toEqual([]);
  });
});

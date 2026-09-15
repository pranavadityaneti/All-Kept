import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { cameraFor } from "../lib/places";

describe("where the map starts", () => {
  it("centres on the one place and comes in close", () => {
    expect(cameraFor([{ lat: 17.43, lng: 78.41 }])).toEqual({ coordinates: { latitude: 17.43, longitude: 78.41 }, zoom: 15 });
  });
  it("frames every place, zoomed out to the widest span with a margin", () => {
    const c = cameraFor([{ lat: 17.43, lng: 78.41 }, { lat: 19.06, lng: 72.83 }]);
    expect(c.coordinates.latitude).toBeCloseTo(18.245, 6);
    expect(c.coordinates.longitude).toBeCloseTo(75.62, 6);
    expect(c.zoom).toBeGreaterThan(5);
    expect(c.zoom).toBeLessThan(8);
    // Two cafés a street apart still get a street-level view, not a continent.
    expect(cameraFor([{ lat: 17.43, lng: 78.41 }, { lat: 17.432, lng: 78.412 }]).zoom).toBe(15);
  });
  it("shows the world when there is nothing to show yet", () => {
    expect(cameraFor([])).toEqual({ coordinates: { latitude: 20, longitude: 0 }, zoom: 1 });
  });
});

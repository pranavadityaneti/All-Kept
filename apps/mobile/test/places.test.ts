import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { cameraFor } from "../lib/places";

describe("where the map starts", () => {
  const phone = { width: 402, height: 874, platform: "ios" as const };
  const android = { ...phone, platform: "android" as const };
  it("centres on the one place and comes in close", () => {
    expect(cameraFor([{ lat: 17.43, lng: 78.41 }], phone)).toEqual({ coordinates: { latitude: 17.43, longitude: 78.41 }, zoom: 15 });
  });
  it("frames every place, zoomed out to the widest span with a margin", () => {
    const c = cameraFor([{ lat: 17.43, lng: 78.41 }, { lat: 19.06, lng: 72.83 }], phone);
    expect(c.coordinates.latitude).toBeCloseTo(18.245, 6);
    expect(c.coordinates.longitude).toBeCloseTo(75.62, 6);
    // Apple's region: 360 / 2^zoom degrees must hold 5.58° of longitude widened by the tall view (×2.17, ×1.35 margin ≈ 16.4°).
    expect(360 / 2 ** c.zoom).toBeCloseTo(5.58 * 1.35 * (874 / 402), 1);
    // Two cafés a street apart still get a street-level view, not a continent.
    expect(cameraFor([{ lat: 17.43, lng: 78.41 }, { lat: 17.432, lng: 78.412 }], phone).zoom).toBe(15);
  });
  it("speaks Google's scale on Android: the world is 256 points wide at zoom 0", () => {
    const c = cameraFor([{ lat: 17.43, lng: 78.41 }, { lat: 19.06, lng: 72.83 }], android);
    // 5.58° × 1.35 of longitude across 402 points.
    expect((360 * 402) / (256 * 2 ** c.zoom)).toBeCloseTo(5.58 * 1.35, 1);
  });
  it("opens on the largest group when the map cannot hold every place, and leaves the rest to panning", () => {
    // Two cafés in Hyderabad and Jaipur, a hotel in Sri Lanka, a café in Kyoto, a dealership in California.
    const c = cameraFor([{ lat: 34.1, lng: -117.7 }, { lat: 17.4, lng: 78.4 }, { lat: 26.9, lng: 75.8 }, { lat: 5.97, lng: 80.4 }, { lat: 35.0, lng: 135.7 }], phone);
    // Framed on India and Sri Lanka: the centre sits between Jaipur and Weligama, and the view is a country, not the world.
    expect(c.coordinates.longitude).toBeCloseTo((75.8 + 80.4) / 2, 6);
    expect(c.coordinates.latitude).toBeCloseTo((5.97 + 26.9) / 2, 6);
    expect(c.zoom).toBeGreaterThan(2);
    expect(c.zoom).toBeLessThan(5);
  });
  it("shows the world when there is nothing to show yet", () => {
    expect(cameraFor([], phone)).toEqual({ coordinates: { latitude: 20, longitude: 0 }, zoom: 1 });
  });
});

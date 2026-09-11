import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}), useMutation: () => ({}), useQueryClient: () => ({}) }));
import { readAspect } from "../lib/item";

describe("a save's shape", () => {
  it("is the learned aspect when there is one", () => {
    expect(readAspect({ aspect: 0.563, oembed: { width: 100, height: 100 } })).toBe(0.563);
  });
  it("falls back to the oEmbed frame size for saves made before the shape was learned", () => {
    expect(readAspect({ oembed: { width: 576, height: 1024 } })).toBeCloseTo(0.5625, 4);
  });
  it("is unknown when neither is usable", () => {
    expect(readAspect(null)).toBeNull();
    expect(readAspect({ aspect: 0 })).toBeNull();
    expect(readAspect({ oembed: { width: 0, height: 1024 } })).toBeNull();
    expect(readAspect({ oembed: { width: "576", height: 1024 } })).toBeNull();
  });
});

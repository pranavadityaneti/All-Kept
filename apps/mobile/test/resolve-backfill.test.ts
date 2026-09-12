import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ supabase: { from: () => ({}), functions: { invoke: async () => ({ error: null }) } } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));

import { MAX_PER_RUN, backfillUnresolvedLinks } from "../lib/resolve-backfill";
import type { ResolveDeps } from "../lib/resolve-backfill";

const SHARE = "https://www.reddit.com/r/HyderabadBuySell/s/llCBDwldJO";
const REAL = "https://www.reddit.com/r/HyderabadBuySell/comments/1we06qx/selling_iphone_17_pro/?utm_source=share";

function fake(over: Partial<ResolveDeps> = {}) {
  const rewritten: { id: string; canonical: string | null; platform: string }[] = [];
  const remembered: string[][] = [];
  const deps: ResolveDeps = {
    candidates: async () => [{ id: "a", sourceUrl: SHARE }],
    resolve: async () => REAL,
    rewrite: async (id, link) => { rewritten.push({ id, canonical: link.canonicalUrl, platform: link.platform }); },
    checked: async () => [],
    remember: async (ids) => { remembered.push(ids); },
    ...over,
  };
  return { deps, rewritten, remembered };
}

describe("following the share links the server cannot", () => {
  it("rewrites the save with the address the link really points at", async () => {
    const f = fake();
    expect(await backfillUnresolvedLinks(f.deps)).toEqual({ resolved: 1, unresolvable: 0 });
    expect(f.rewritten).toEqual([{ id: "a", platform: "reddit", canonical: "https://www.reddit.com/r/HyderabadBuySell/comments/1we06qx/" }]);
    expect(f.remembered).toEqual([]);
  });

  it("leaves a link it could not follow this time for next time", async () => {
    // Offline, or the platform refusing right now. That says nothing about the link itself.
    const f = fake({ resolve: async () => null });
    expect(await backfillUnresolvedLinks(f.deps)).toEqual({ resolved: 0, unresolvable: 0 });
    expect(f.rewritten).toEqual([]);
    expect(f.remembered).toEqual([]);
  });

  it("gives up, once, on a link that leads somewhere with nothing to keep", async () => {
    const f = fake({ resolve: async () => "https://www.tiktok.com/" });
    expect(await backfillUnresolvedLinks(f.deps)).toEqual({ resolved: 0, unresolvable: 1 });
    expect(f.rewritten).toEqual([]);
    expect(f.remembered).toEqual([["a"]]);
  });

  it("skips a save with no address at all rather than following nothing", async () => {
    const f = fake({ candidates: async () => [{ id: "a", sourceUrl: null }] });
    expect(await backfillUnresolvedLinks(f.deps)).toEqual({ resolved: 0, unresolvable: 1 });
  });

  it("skips the ones already given up on, and takes only a handful at a time", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, sourceUrl: SHARE }));
    const asked: string[] = [];
    const f = fake({ candidates: async () => many, checked: async () => ["i0", "i1"], resolve: async (u) => { asked.push(u); return REAL; } });
    const out = await backfillUnresolvedLinks(f.deps);
    expect(out.resolved).toBe(MAX_PER_RUN);
    expect(asked.length).toBe(MAX_PER_RUN);
  });

  it("one save's failure does not stop the next", async () => {
    const f = fake({
      candidates: async () => [{ id: "a", sourceUrl: SHARE }, { id: "b", sourceUrl: SHARE }],
      rewrite: async (id) => { if (id === "a") throw new Error("network"); },
    });
    expect((await backfillUnresolvedLinks(f.deps)).resolved).toBe(1);
  });
});

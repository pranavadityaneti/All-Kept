import { describe, expect, it, vi } from "vitest";

// The module reaches the real client and the phone's storage for its live doors; the logic under
// test takes its doors as arguments, so the native ones are stood in for here.
vi.mock("../lib/supabase", () => ({ supabase: { from: () => ({}), functions: { invoke: async () => ({ error: null }) } } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
import { MAX_PER_RUN, backfillRedditThumbnails, feedUrl, parseFeedThumbnail } from "../lib/reddit-thumbnail";
import type { BackfillDeps } from "../lib/reddit-thumbnail";

const FEED_WITH = '<feed><entry><id>t3_x</id><media:thumbnail url="https://external-preview.redd.it/a.png?width=640&amp;crop=smart&amp;s=sig"/></entry></feed>';
const FEED_WITHOUT = "<feed><entry><id>t3_x</id></entry></feed>";

describe("where a Reddit post's feed lives", () => {
  it("is the post's own address with .rss on the end, however the link was stored", () => {
    expect(feedUrl("https://www.reddit.com/r/SaaS/comments/abc123/")).toBe("https://www.reddit.com/r/SaaS/comments/abc123/.rss");
    expect(feedUrl("https://www.reddit.com/r/SaaS/comments/abc123")).toBe("https://www.reddit.com/r/SaaS/comments/abc123/.rss");
  });
});

describe("reading the picture out of the feed", () => {
  it("finds the address and puts its escaped characters back", () => {
    expect(parseFeedThumbnail(FEED_WITH)).toBe("https://external-preview.redd.it/a.png?width=640&crop=smart&s=sig");
  });
  it("says nothing when the post has no picture, which a text post never does", () => {
    expect(parseFeedThumbnail(FEED_WITHOUT)).toBeNull();
    expect(parseFeedThumbnail("")).toBeNull();
    expect(parseFeedThumbnail("not xml at all")).toBeNull();
  });
});

function fake(over: Partial<BackfillDeps> = {}) {
  const stored: { id: string; url: string }[] = [];
  const remembered: string[][] = [];
  const deps: BackfillDeps = {
    candidates: async () => [{ id: "a", canonicalUrl: "https://www.reddit.com/r/x/comments/a/" }],
    fetchFeed: async () => FEED_WITH,
    store: async (id, url) => { stored.push({ id, url }); },
    checked: async () => [],
    remember: async (ids) => { remembered.push(ids); },
    ...over,
  };
  return { deps, stored, remembered };
}

describe("filling in the pictures Reddit only tells a phone about", () => {
  it("stores the picture it finds", async () => {
    const f = fake();
    expect(await backfillRedditThumbnails(f.deps)).toEqual({ stored: 1, noPicture: 0 });
    expect(f.stored).toEqual([{ id: "a", url: "https://external-preview.redd.it/a.png?width=640&crop=smart&s=sig" }]);
  });

  it("remembers a post that has no picture, so its feed is never asked for again", async () => {
    const f = fake({ fetchFeed: async () => FEED_WITHOUT });
    expect(await backfillRedditThumbnails(f.deps)).toEqual({ stored: 0, noPicture: 1 });
    expect(f.stored).toEqual([]);
    expect(f.remembered).toEqual([["a"]]);
  });

  it("does not give up on a feed that merely could not be read this time", async () => {
    // Reddit rate-limits its feeds. A refusal now says nothing about the post, so it stays a candidate.
    const f = fake({ fetchFeed: async () => null });
    expect(await backfillRedditThumbnails(f.deps)).toEqual({ stored: 0, noPicture: 0 });
    expect(f.remembered).toEqual([]);
  });

  it("skips the ones it has already looked at, and never asks for more than a handful at a time", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, canonicalUrl: `https://www.reddit.com/r/x/comments/i${i}/` }));
    const asked: string[] = [];
    const f = fake({
      candidates: async () => many,
      checked: async () => ["i0", "i1"],
      fetchFeed: async (url) => { asked.push(url); return FEED_WITH; },
    });
    const out = await backfillRedditThumbnails(f.deps);
    expect(out.stored).toBe(MAX_PER_RUN);
    expect(asked.length).toBe(MAX_PER_RUN);
    expect(asked.some((u) => u.includes("/i0/") || u.includes("/i1/"))).toBe(false);
  });

  it("leaves a save with no address alone rather than building a feed URL out of nothing", async () => {
    const f = fake({ candidates: async () => [{ id: "a", canonicalUrl: null }] });
    expect(await backfillRedditThumbnails(f.deps)).toEqual({ stored: 0, noPicture: 1 });
    expect(f.stored).toEqual([]);
  });

  it("one failure does not stop the rest", async () => {
    const f = fake({
      candidates: async () => [
        { id: "a", canonicalUrl: "https://www.reddit.com/r/x/comments/a/" },
        { id: "b", canonicalUrl: "https://www.reddit.com/r/x/comments/b/" },
      ],
      store: async (id) => { if (id === "a") throw new Error("network"); },
    });
    expect(await backfillRedditThumbnails(f.deps)).toEqual({ stored: 1, noPicture: 0 });
  });
});

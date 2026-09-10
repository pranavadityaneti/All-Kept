import { describe, expect, it } from "vitest";
import { DEFAULT_ASPECT, EMBED_ORIGIN, embedFit, embedUrl, fitBox, initialHeight } from "../lib/embed";

const item = (over: Partial<Parameters<typeof embedUrl>[0]> = {}) => ({
  platform: "instagram", canonicalUrl: null, sourceUrl: null, externalId: null, ...over,
});

describe("playing a save in the app", () => {
  it("builds Instagram's embed address for reels and posts, whatever shape the link arrived in", () => {
    expect(embedUrl(item({ canonicalUrl: "https://www.instagram.com/reel/DcVMQIIMa5-/" })))
      .toBe("https://www.instagram.com/reel/DcVMQIIMa5-/embed/");
    expect(embedUrl(item({ canonicalUrl: "https://www.instagram.com/p/ABC123/" })))
      .toBe("https://www.instagram.com/p/ABC123/embed/");
    expect(embedUrl(item({ canonicalUrl: "https://instagram.com/reels/XYZ789" })))
      .toBe("https://www.instagram.com/reel/XYZ789/embed/");
    expect(embedUrl(item({ canonicalUrl: null, sourceUrl: "https://www.instagram.com/tv/TV1/" })))
      .toBe("https://www.instagram.com/tv/TV1/embed/");
  });

  it("plays YouTube through the no-cookie host, inline, and names an origin", () => {
    // The origin is not decoration: without it YouTube answers a WebView with "Video player
    // configuration error (153)", because the request carries no referrer at all.
    const url = embedUrl(item({ platform: "youtube", externalId: "WfJPBVXPt8k" }))!;
    expect(url).toContain("https://www.youtube-nocookie.com/embed/WfJPBVXPt8k?");
    expect(url).toContain("playsinline=1");
    expect(url).toContain("rel=0");
    expect(url).toContain(`origin=${encodeURIComponent(EMBED_ORIGIN)}`);
  });

  it("has nothing to play for a post with no link, a note or an unknown platform", () => {
    expect(embedUrl(item({ canonicalUrl: null, sourceUrl: null }))).toBeNull();
    expect(embedUrl(item({ platform: "note" }))).toBeNull();
    expect(embedUrl(item({ platform: "web", canonicalUrl: "https://example.com/x" }))).toBeNull();
    expect(embedUrl(item({ platform: "youtube", externalId: null }))).toBeNull();
  });

  it("asks a card how tall it is and never asks a player", () => {
    // A player answers with the height of the box it was given, so believing it shrinks the box a
    // little every time the page changes — which, while a video plays, is many times a second.
    expect(embedFit("youtube")).toBe("player");
    expect(embedFit("instagram")).toBe("card");
    expect(embedFit("reddit")).toBe("card");
  });

  it("draws a player at the video's own shape, never letterboxed and never overflowing", () => {
    // A widescreen video takes the full width and only the height it needs.
    expect(fitBox(16 / 9, 360, 600)).toEqual({ width: 360, height: 203 });
    // A Short is 0.563 — it would want 640px of height at full width, so it is narrowed to fit 600
    // rather than sitting in a 16:9 frame with black bars either side, which was the bug.
    expect(fitBox(0.563, 360, 600)).toEqual({ width: 338, height: 600 });
    // Exactly as tall as the space allows: keep the full width, no narrowing.
    expect(fitBox(0.6, 360, 600)).toEqual({ width: 360, height: 600 });
  });

  it("falls back to 16:9 rather than drawing a box from a number that means nothing", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(fitBox(bad, 360, 9999)).toEqual(fitBox(DEFAULT_ASPECT, 360, 9999));
    }
  });

  it("starts a video box at the shape of its platform", () => {
    expect(initialHeight("youtube", 320)).toBe(188);
    expect(initialHeight("instagram", 320)).toBe(448);
  });
});

describe("a saved YouTube playlist", () => {
  const yt = (over: Record<string, unknown>) => ({ platform: "youtube", canonicalUrl: null, sourceUrl: null, externalId: null, ...over }) as Parameters<typeof embedUrl>[0];

  it("embeds through videoseries, not as a video that does not exist", () => {
    // /embed/PLxxxx returns "An error occurred. Please try again later." — the playlist id was
    // being handed to YouTube as though it were a video id.
    const url = embedUrl(yt({ canonicalUrl: "https://www.youtube.com/playlist?list=PLjp4kRtCGC5WuB5BJlbMZ9RW3NEFv07yQ", externalId: "PLjp4kRtCGC5WuB5BJlbMZ9RW3NEFv07yQ" }))!;
    expect(url).toContain("/embed/videoseries?list=PLjp4kRtCGC5WuB5BJlbMZ9RW3NEFv07yQ");
    expect(url).not.toContain("/embed/PLjp4kRt");
  });

  it("still plays the video when a watch link merely carries a list alongside it", () => {
    // Sharing from inside a playlist gives both. The video is what was being watched.
    const url = embedUrl(yt({ canonicalUrl: "https://www.youtube.com/watch?v=bD0GoM9JVns&list=PLabc123", externalId: "bD0GoM9JVns" }))!;
    expect(url).toContain("/embed/bD0GoM9JVns?");
    expect(url).not.toContain("videoseries");
  });

  it("carries the origin a playlist needs just as a video does", () => {
    const url = embedUrl(yt({ canonicalUrl: "https://www.youtube.com/playlist?list=PLxyz", externalId: "PLxyz" }))!;
    expect(url).toContain(`origin=${encodeURIComponent(EMBED_ORIGIN)}`);
    expect(url).toContain("playsinline=1");
  });
});

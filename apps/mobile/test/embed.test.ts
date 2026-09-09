import { describe, expect, it } from "vitest";
import { embedUrl, initialHeight } from "../lib/embed";

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

  it("plays YouTube through the no-cookie host, inline", () => {
    expect(embedUrl(item({ platform: "youtube", externalId: "WfJPBVXPt8k" })))
      .toBe("https://www.youtube-nocookie.com/embed/WfJPBVXPt8k?playsinline=1&rel=0");
  });

  it("has nothing to play for a post with no link, a note or an unknown platform", () => {
    expect(embedUrl(item({ canonicalUrl: null, sourceUrl: null }))).toBeNull();
    expect(embedUrl(item({ platform: "note" }))).toBeNull();
    expect(embedUrl(item({ platform: "web", canonicalUrl: "https://example.com/x" }))).toBeNull();
    expect(embedUrl(item({ platform: "youtube", externalId: null }))).toBeNull();
  });

  it("starts a video box at the shape of its platform", () => {
    expect(initialHeight("youtube", 320)).toBe(188);
    expect(initialHeight("instagram", 320)).toBe(448);
  });
});

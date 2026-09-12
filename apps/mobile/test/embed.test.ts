import { describe, expect, it } from "vitest";
import { DEFAULT_ASPECT, EMBED_ORIGIN, embedFit, embedUrl, fitBox, initialAspect, initialHeight, isPlayerAddress } from "../lib/embed";

const item = (over: Partial<Parameters<typeof embedUrl>[0]> = {}) => ({
  platform: "instagram", kind: "short_video", canonicalUrl: null, sourceUrl: null, externalId: null, ...over,
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
    // Autoplay is asked of YouTube in its own words as well, so its controls start in agreement
    // with the state the player script applies. Muted: sound is the speaker button's decision.
    expect(url).toContain("autoplay=1");
    expect(url).toContain("mute=1");
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
    expect(url).toContain("autoplay=1");
    expect(url).toContain("mute=1");
  });
});

describe("a playlist the provider will not play", () => {
  it("is not embedded at all, rather than embedded into an error", () => {
    // YouTube refuses an unlisted playlist in a frame and says "This video is unavailable" inside
    // it. A card with the playlist's own picture on it beats a black rectangle.
    const item = { platform: "youtube", kind: "post", canonicalUrl: "https://www.youtube.com/playlist?list=PLxyz", sourceUrl: null, externalId: "PLxyz", embeddable: false };
    expect(embedUrl(item)).toBeNull();
  });

  it("is embedded when the provider allows it, or when nothing is known either way", () => {
    const base = { platform: "youtube", kind: "post", canonicalUrl: "https://www.youtube.com/playlist?list=PLxyz", sourceUrl: null, externalId: "PLxyz" };
    expect(embedUrl({ ...base, embeddable: true })).toContain("videoseries?list=PLxyz");
    // Saves made before this was recorded must not lose their player on a guess.
    expect(embedUrl(base)).toContain("videoseries?list=PLxyz");
  });

  it("never blocks a video on a flag meant for playlists", () => {
    const video = { platform: "youtube", kind: "video", canonicalUrl: "https://www.youtube.com/watch?v=abc123", sourceUrl: null, externalId: "abc123", embeddable: false };
    expect(embedUrl(video)).toContain("/embed/abc123?");
  });
});

describe("a saved TikTok", () => {
  const VIDEO = "https://www.tiktok.com/@tiktok/video/7532540099460893983";
  it("plays through TikTok's player, looping, with our own sound button in charge", () => {
    const url = embedUrl(item({ platform: "tiktok", kind: "short_video", canonicalUrl: VIDEO, externalId: "7532540099460893983" }));
    expect(url).toBe("https://www.tiktok.com/player/v1/7532540099460893983?loop=1&description=0&music_info=0&fullscreen_button=0&native_context_menu=0&rel=0&volume_control=0&autoplay=1");
  });
  it("asks TikTok's player to start on its own, in TikTok's own words", () => {
    // The player defaults to autoplay=0, so without this it waits for a tap however we drive it.
    const url = embedUrl(item({ platform: "tiktok", kind: "short_video", canonicalUrl: VIDEO, externalId: "7532540099460893983" }))!;
    expect(url).toContain("autoplay=1");
  });
  it("does not ask a photo post to autoplay, since its sound is music we never start", () => {
    const url = embedUrl(item({ platform: "tiktok", kind: "image", canonicalUrl: "https://www.tiktok.com/@tiktok/photo/7400000000000000000", externalId: "7400000000000000000" }))!;
    expect(url).not.toContain("autoplay=1");
  });
  it("opens a photo post in the same player and leaves TikTok's volume control to its music", () => {
    const url = embedUrl(item({ platform: "tiktok", kind: "image", canonicalUrl: "https://www.tiktok.com/@tiktok/photo/7400000000000000000", externalId: "7400000000000000000" }));
    expect(url).toContain("/player/v1/7400000000000000000?");
    expect(url).toContain("volume_control=1");
  });
  it("has nothing to play for a profile, or for a short link that never learned its id", () => {
    expect(embedUrl(item({ platform: "tiktok", kind: "profile", canonicalUrl: "https://www.tiktok.com/@tiktok" }))).toBeNull();
    expect(embedUrl(item({ platform: "tiktok", kind: "short_video", sourceUrl: "https://vm.tiktok.com/ZS9dHGEcApLyX", externalId: null }))).toBeNull();
  });
  it("never offers TikTok's recommendations in place of the save", () => {
    // Asked for a video it will not serve, TikTok's player fills the space with other people's
    // videos. rel=0 keeps any such suggestion to the author of the save, which is at least related
    // to what was kept — Allkept shows nobody a feed of strangers.
    const url = embedUrl(item({ platform: "tiktok", kind: "short_video", canonicalUrl: VIDEO, externalId: "7532540099460893983" }))!;
    expect(url).toContain("rel=0");
  });
  it("does not open TikTok's player for a post TikTok has already said is not there", () => {
    // Enrichment marks a TikTok preview_unavailable only when its oEmbed refused outright, which for
    // TikTok means the post is gone. Loading the player then shows their error page and its carousel.
    const gone = embedUrl(item({ platform: "tiktok", kind: "short_video", canonicalUrl: VIDEO, externalId: "7532540099460893900", status: "preview_unavailable" }));
    expect(gone).toBeNull();
  });
  it("still opens the player for a photo post, whose oEmbed always refuses", () => {
    // TikTok answers 400 for every photo post, not only missing ones — it simply does not describe
    // them. Treating that as "the post is gone" would keep every carousel out of its own player.
    const url = embedUrl(item({ platform: "tiktok", kind: "image", canonicalUrl: "https://www.tiktok.com/@lior/photo/7663185415209258253", externalId: "7663185415209258253", status: "preview_unavailable" }));
    expect(url).toContain("/player/v1/7663185415209258253");
  });
  it("still opens Instagram's embed for a post we merely could not read", () => {
    // Instagram answers our server with a login wall, which says nothing about whether the post
    // embeds — and it does. So the same status must not lock Instagram out of its player.
    const url = embedUrl(item({ platform: "instagram", kind: "post", canonicalUrl: "https://www.instagram.com/p/DcVMQIIMa5-/", status: "preview_unavailable" }));
    expect(url).toContain("/embed/");
  });
  it("is laid out as a player, tall by default", () => {
    expect(embedFit("tiktok")).toBe("player");
    expect(initialAspect("tiktok", "short_video")).toBeCloseTo(9 / 16, 5);
    expect(initialAspect("tiktok", "image")).toBeCloseTo(3 / 4, 5);
    expect(initialAspect("youtube", "video")).toBe(DEFAULT_ASPECT);
    expect(initialAspect("instagram", "short_video")).toBe(DEFAULT_ASPECT);
  });
});

describe("addresses the player may stay on", () => {
  it("accepts every provider's embed page and TikTok's player, and refuses the sites themselves", () => {
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/embed/")).toBe(true);
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/embed/captioned/")).toBe(true);
    expect(isPlayerAddress("https://www.youtube-nocookie.com/embed/WfJPBVXPt8k?playsinline=1")).toBe(true);
    expect(isPlayerAddress("https://www.tiktok.com/player/v1/7532540099460893983?loop=1")).toBe(true);
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/")).toBe(false);
    expect(isPlayerAddress("https://www.tiktok.com/@tiktok/video/7532540099460893983")).toBe(false);
    expect(isPlayerAddress("https://www.youtube.com/watch?v=WfJPBVXPt8k")).toBe(false);
  });
});

describe("a saved Reddit post", () => {
  const POST = "https://www.reddit.com/r/SaaS/comments/1wdmycf/";
  const COMMENT = "https://www.reddit.com/r/SaaS/comments/abc123/comment/def456/";
  it("shows the post itself through Reddit's own embed", () => {
    // Reddit hands us a title and an author and nothing else: no picture, and its post pages answer
    // our server 403, so the usual link-preview fallback can never fill the card. Its official embed
    // can, and the phone loading it is an ordinary client rather than a datacentre.
    const url = embedUrl(item({ platform: "reddit", kind: "post", canonicalUrl: POST, externalId: "1wdmycf" }))!;
    expect(url).toContain("https://www.redditmedia.com/r/SaaS/comments/1wdmycf/");
    expect(url).toContain("embed=true");
  });
  it("shows a saved comment as the comment, not the thread it sits under", () => {
    const url = embedUrl(item({ platform: "reddit", kind: "post", canonicalUrl: COMMENT, externalId: "abc123_def456" }))!;
    expect(url).toContain("/r/SaaS/comments/abc123/comment/def456/");
    expect(url).toContain("embed=true");
  });
  it("has nothing to show for a subreddit or a link that is not a post", () => {
    expect(embedUrl(item({ platform: "reddit", kind: "post", canonicalUrl: "https://www.reddit.com/r/SaaS" }))).toBeNull();
    expect(embedUrl(item({ platform: "reddit", kind: "post", canonicalUrl: null, sourceUrl: null }))).toBeNull();
  });
  it("is a card that reports its own height, not a player filling a box", () => {
    expect(embedFit("reddit")).toBe("card");
  });
  it("is a page the player may stay on", () => {
    expect(isPlayerAddress("https://www.redditmedia.com/r/SaaS/comments/1wdmycf/?embed=true&theme=light")).toBe(true);
    expect(isPlayerAddress("https://www.reddit.com/r/SaaS/comments/1wdmycf/")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { normalize, extractFirstUrl, fnv1a64, type NormalizedLink } from "../src/index";

type Row = { name: string; url?: string; text?: string; expect: Partial<NormalizedLink> };

const IG = "https://www.instagram.com";
const rows: Row[] = [
  // Instagram
  { name: "ig reel with igsh", url: "https://www.instagram.com/reel/C9AbCdEfGhI/?igsh=MTIzNDU2Nzg5MA==",
    expect: { platform: "instagram", kind: "short_video", canonicalUrl: `${IG}/reel/C9AbCdEfGhI/`, externalId: "C9AbCdEfGhI" } },
  { name: "ig reels plural path", url: "https://instagram.com/reels/C9AbCdEfGhI",
    expect: { platform: "instagram", kind: "short_video", canonicalUrl: `${IG}/reel/C9AbCdEfGhI/` } },
  { name: "ig post with username prefix and utm", url: "https://www.instagram.com/natgeo/p/C1xYz_-AbCd/?utm_source=ig_web_copy_link",
    expect: { platform: "instagram", kind: "post", canonicalUrl: `${IG}/p/C1xYz_-AbCd/`, externalId: "C1xYz_-AbCd" } },
  { name: "ig tv", url: "https://www.instagram.com/tv/CAbCdEfGhIJ/",
    expect: { platform: "instagram", kind: "video", canonicalUrl: `${IG}/tv/CAbCdEfGhIJ/` } },
  { name: "ig share link needs expansion", url: "https://www.instagram.com/share/reel/BAJrQwerty",
    expect: { platform: "instagram", needsExpansion: true, canonicalUrl: null } },
  // YouTube
  { name: "yt watch with si and t", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s&si=abc123",
    expect: { platform: "youtube", kind: "video", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", externalId: "dQw4w9WgXcQ" } },
  { name: "youtu.be", url: "https://youtu.be/dQw4w9WgXcQ?si=xyz",
    expect: { platform: "youtube", kind: "video", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
  { name: "yt shorts", url: "https://youtube.com/shorts/aBcDeFgHiJk?feature=share",
    expect: { platform: "youtube", kind: "short_video", canonicalUrl: "https://www.youtube.com/shorts/aBcDeFgHiJk", externalId: "aBcDeFgHiJk" } },
  { name: "yt mobile host", url: "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2",
    expect: { platform: "youtube", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
  { name: "yt live", url: "https://www.youtube.com/live/LiVeId12345?feature=share",
    expect: { platform: "youtube", kind: "video", canonicalUrl: "https://www.youtube.com/watch?v=LiVeId12345" } },
  { name: "yt playlist only", url: "https://www.youtube.com/playlist?list=PLabc123",
    expect: { platform: "youtube", kind: "post", canonicalUrl: "https://www.youtube.com/playlist?list=PLabc123", externalId: "PLabc123" } },
  // X
  { name: "x status with s and t", url: "https://x.com/naval/status/1002103360646823936?s=20&t=abc",
    expect: { platform: "x", kind: "post", canonicalUrl: "https://x.com/naval/status/1002103360646823936", externalId: "1002103360646823936" } },
  { name: "twitter.com host", url: "https://twitter.com/naval/status/1002103360646823936",
    expect: { platform: "x", canonicalUrl: "https://x.com/naval/status/1002103360646823936" } },
  { name: "x i/web status", url: "https://x.com/i/web/status/1002103360646823936",
    expect: { platform: "x", canonicalUrl: "https://x.com/i/web/status/1002103360646823936", externalId: "1002103360646823936" } },
  { name: "t.co needs expansion", url: "https://t.co/AbCdEf123",
    expect: { platform: "x", needsExpansion: true, canonicalUrl: null } },
  // Facebook
  { name: "fb share link needs expansion", url: "https://www.facebook.com/share/p/1AbCdEfGh/?mibextid=wwXIfr",
    expect: { platform: "facebook", needsExpansion: true } },
  { name: "fb reel", url: "https://www.facebook.com/reel/1234567890123456?mibextid=abc",
    expect: { platform: "facebook", kind: "short_video", canonicalUrl: "https://www.facebook.com/reel/1234567890123456", externalId: "1234567890123456" } },
  { name: "fb watch", url: "https://www.facebook.com/watch/?v=987654321&rdid=xyz",
    expect: { platform: "facebook", kind: "video", canonicalUrl: "https://www.facebook.com/watch/?v=987654321", externalId: "987654321" } },
  { name: "fb page post", url: "https://m.facebook.com/nasa/posts/10159999999999999?comment_id=1",
    expect: { platform: "facebook", kind: "post", canonicalUrl: "https://www.facebook.com/nasa/posts/10159999999999999", externalId: "10159999999999999" } },
  { name: "fb photo", url: "https://www.facebook.com/photo/?fbid=1122334455&set=a.1",
    expect: { platform: "facebook", kind: "image", canonicalUrl: "https://www.facebook.com/photo/?fbid=1122334455", externalId: "1122334455" } },
  { name: "fb.watch needs expansion", url: "https://fb.watch/abc123XYZ/",
    expect: { platform: "facebook", needsExpansion: true } },
  // TikTok
  { name: "tiktok video", url: "https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1&sender_device=pc",
    expect: { platform: "tiktok", kind: "short_video", canonicalUrl: "https://www.tiktok.com/@scout2015/video/6718335390845095173", externalId: "6718335390845095173" } },
  { name: "vm.tiktok needs expansion", url: "https://vm.tiktok.com/ZMabc123/",
    expect: { platform: "tiktok", needsExpansion: true } },
  { name: "tiktok photo", url: "https://www.tiktok.com/@user/photo/7300000000000000000",
    expect: { platform: "tiktok", kind: "image", externalId: "7300000000000000000" } },
  // Reddit
  { name: "reddit comments with slug and query", url: "https://www.reddit.com/r/india/comments/1abc2de/some_title_here/?utm_source=share&utm_medium=web2x",
    expect: { platform: "reddit", kind: "post", canonicalUrl: "https://www.reddit.com/r/india/comments/1abc2de/", externalId: "1abc2de" } },
  { name: "old.reddit", url: "https://old.reddit.com/r/india/comments/1abc2de/some_title_here/",
    expect: { platform: "reddit", canonicalUrl: "https://www.reddit.com/r/india/comments/1abc2de/" } },
  { name: "reddit share /s/ needs expansion", url: "https://www.reddit.com/r/india/s/AbCdEfGh12",
    expect: { platform: "reddit", needsExpansion: true } },
  { name: "redd.it needs expansion", url: "https://redd.it/1abc2de",
    expect: { platform: "reddit", needsExpansion: true } },
  // Threads, LinkedIn, Pinterest
  { name: "threads.net post", url: "https://www.threads.net/@zuck/post/C8AbCdEfGh1?xmt=AQGz",
    expect: { platform: "threads", kind: "post", canonicalUrl: "https://www.threads.com/@zuck/post/C8AbCdEfGh1", externalId: "C8AbCdEfGh1" } },
  { name: "linkedin post", url: "https://www.linkedin.com/posts/satyanadella_ai-activity-7200000000000000000-AbCd?utm_source=share",
    expect: { platform: "linkedin", kind: "post", canonicalUrl: "https://www.linkedin.com/posts/satyanadella_ai-activity-7200000000000000000-AbCd" } },
  { name: "lnkd.in needs expansion", url: "https://lnkd.in/gAbCdEf",
    expect: { platform: "linkedin", needsExpansion: true } },
  { name: "pinterest pin", url: "https://in.pinterest.com/pin/1234567890123456789/?nic_v3=1",
    expect: { platform: "pinterest", kind: "image", canonicalUrl: "https://www.pinterest.com/pin/1234567890123456789/", externalId: "1234567890123456789" } },
  { name: "pin.it needs expansion", url: "https://pin.it/AbCdEf",
    expect: { platform: "pinterest", needsExpansion: true } },
  // Web
  { name: "web article strips tracking and hash", url: "https://Example.com/blog/post?utm_source=x&fbclid=abc&page=2#section",
    expect: { platform: "web", kind: "article", canonicalUrl: "https://example.com/blog/post?page=2", externalId: null } },
  { name: "web root keeps slash", url: "https://example.com/?gclid=1",
    expect: { platform: "web", canonicalUrl: "https://example.com/" } },
  { name: "web trailing slash removed on paths", url: "https://example.com/a/b/",
    expect: { platform: "web", canonicalUrl: "https://example.com/a/b" } },
  { name: "web sorts remaining query keys", url: "https://example.com/p?b=2&a=1",
    expect: { platform: "web", canonicalUrl: "https://example.com/p?a=1&b=2" } },
  // Text handling
  { name: "text containing a url", text: "check this out https://youtu.be/dQw4w9WgXcQ so good",
    expect: { platform: "youtube", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", text: "check this out https://youtu.be/dQw4w9WgXcQ so good" } },
  { name: "plain text note", text: "Remember: buy the blue lamp from that shop in Jubilee Hills",
    expect: { platform: "note", kind: "text", canonicalUrl: null, sourceUrl: null } },
];

describe("normalize", () => {
  for (const row of rows) {
    it(row.name, () => {
      const out = normalize({ url: row.url ?? null, text: row.text ?? null });
      for (const [k, v] of Object.entries(row.expect)) {
        expect(out[k as keyof NormalizedLink], k).toEqual(v);
      }
    });
  }

  it("note externalId is a stable hash of trimmed text", () => {
    const a = normalize({ url: null, text: "  hello world " });
    const b = normalize({ url: null, text: "hello world" });
    expect(a.externalId).toBe(b.externalId);
    expect(a.externalId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects non-http schemes as notes", () => {
    const out = normalize({ url: "javascript:alert(1)", text: null });
    expect(out.platform).toBe("note");
    expect(out.sourceUrl).toBeNull();
  });

  it("empty input yields a note with null text", () => {
    const out = normalize({ url: null, text: "   " });
    expect(out.platform).toBe("note");
    expect(out.text).toBeNull();
  });
});

describe("extractFirstUrl", () => {
  it("finds the first http(s) url in text", () => {
    expect(extractFirstUrl("see https://a.com/x and http://b.com")).toBe("https://a.com/x");
  });
  it("trims trailing punctuation", () => {
    expect(extractFirstUrl("look: https://a.com/x).")).toBe("https://a.com/x");
  });
  it("returns null when none", () => {
    expect(extractFirstUrl("no links here")).toBeNull();
  });
});

describe("fnv1a64", () => {
  it("is deterministic and 16 hex chars", () => {
    expect(fnv1a64("abc")).toBe(fnv1a64("abc"));
    expect(fnv1a64("abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64("abc")).not.toBe(fnv1a64("abd"));
  });
});

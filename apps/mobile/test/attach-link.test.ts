import { describe, expect, it } from "vitest";
import { parseAttachedLink } from "../lib/attach-link";

const REEL = "https://www.instagram.com/reel/DcVMQIIMa5-/";

describe("pasting a link onto a save", () => {
  it("accepts a full Instagram permalink and keeps its identity", () => {
    const link = parseAttachedLink(REEL, "instagram");
    expect([link.platform, link.kind, link.externalId]).toEqual(["instagram", "short_video", "DcVMQIIMa5-"]);
    expect(link.canonicalUrl).toBe(REEL);
  });

  it("refuses an address whose host cannot be real", () => {
    for (const bad of ["https://localhost", "instagram", "https://a."]) {
      expect(() => parseAttachedLink(bad)).toThrow(/missing part of its address|does not look like a link/);
    }
  });

  it("refuses a half-typed paste when the save says which platform it needs", () => {
    // "www.instagram" is a valid host name that does not exist; only the platform expectation catches it.
    expect(() => parseAttachedLink("https://www.instagram", "instagram")).toThrow(/Instagram post itself/);
    expect(parseAttachedLink("https://www.instagram").platform).toBe("web"); // documented limit, recoverable
  });

  it("refuses empty input, plain words and non-web schemes", () => {
    expect(() => parseAttachedLink("   ")).toThrow(/Paste the link first/);
    expect(() => parseAttachedLink("javascript:alert(1)")).toThrow(/does not look like a link/);
    expect(() => parseAttachedLink("just some words")).toThrow(/does not look like a link|missing part/);
  });

  it("only accepts an Instagram link when that is what the post needs", () => {
    expect(() => parseAttachedLink("https://www.youtube.com/watch?v=WfJPBVXPt8k", "instagram")).toThrow(/Instagram post itself/);
    expect(parseAttachedLink("https://www.youtube.com/watch?v=WfJPBVXPt8k").platform).toBe("youtube");
  });

  it("takes a bare host with a path, the way a copied link often arrives", () => {
    expect(parseAttachedLink("www.instagram.com/p/ABC123/", "instagram").platform).toBe("instagram");
  });
});

it("does not turn a linkless post into an Instagram profile or story", () => {
  for (const url of ["https://www.instagram.com/person/", "https://www.instagram.com/stories/person/123/"]) {
    expect(() => parseAttachedLink(url, "instagram")).toThrow(/not a profile or story/);
  }
});

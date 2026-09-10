import { describe, expect, it } from "vitest";
import { normalize } from "../src/index";
const k = (u: string) => normalize({ url: u }).kind;

describe("a page is not a post", () => {
  it("recognises a profile on every platform that has one", () => {
    expect(k("https://www.instagram.com/natgeo/")).toBe("profile");
    expect(k("https://www.youtube.com/@mkbhd")).toBe("profile");
    expect(k("https://www.youtube.com/c/mkbhd")).toBe("profile");
    expect(k("https://www.youtube.com/channel/UCabc123")).toBe("profile");
    expect(k("https://www.tiktok.com/@user")).toBe("profile");
    expect(k("https://x.com/jack")).toBe("profile");
    expect(k("https://www.reddit.com/r/programming/")).toBe("profile");
    expect(k("https://www.reddit.com/user/someone")).toBe("profile");
  });

  it("never mistakes a post for a profile", () => {
    // The thing this could most easily break: a one-segment path that is a route, not a handle.
    expect(k("https://www.instagram.com/reel/DcVMQIIMa5-/")).toBe("short_video");
    expect(k("https://www.instagram.com/p/ABC123/")).toBe("post");
    expect(k("https://x.com/jack/status/20")).toBe("post");
    expect(k("https://www.tiktok.com/@user/video/7300000000000000000")).toBe("short_video");
    expect(k("https://www.reddit.com/r/programming/comments/abc/title/")).toBe("post");
    expect(k("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("video");
    expect(k("https://www.youtube.com/playlist?list=PLabc")).toBe("post");
  });

  it("does not read a platform's own routes as somebody's handle", () => {
    for (const u of ["https://www.instagram.com/explore/", "https://www.instagram.com/accounts/",
                     "https://x.com/home", "https://x.com/explore", "https://x.com/messages"]) {
      expect(normalize({ url: u }).kind).not.toBe("profile");
    }
  });
});

describe("a story will not be there tomorrow", () => {
  it("is recognised as a story rather than a post", () => {
    expect(k("https://www.instagram.com/stories/natgeo/3512/")).toBe("story");
  });
});

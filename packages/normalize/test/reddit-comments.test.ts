import { describe, expect, it } from "vitest";
import { normalize } from "../src/index";

describe("a Reddit comment is not its thread", () => {
  const n = (u: string) => normalize({ url: u });

  it("keeps a comment permalink distinct from the post it sits under", () => {
    // They shared an external_id, and the unique index on (user, platform, external_id) then
    // deduplicated the comment away: you saved a reply and were handed the thread.
    const post = n("https://www.reddit.com/r/programming/comments/abc123/some_title/");
    const comment = n("https://www.reddit.com/r/programming/comments/abc123/some_title/def456/");
    expect(post.externalId).toBe("abc123");
    expect(comment.externalId).toBe("abc123_def456");
    expect(comment.canonicalUrl).not.toBe(post.canonicalUrl);
  });

  it("does the same under a user profile thread", () => {
    const post = n("https://www.reddit.com/user/someone/comments/abc123/title/");
    const comment = n("https://www.reddit.com/user/someone/comments/abc123/title/def456/");
    expect(comment.externalId).toBe("abc123_def456");
    expect(comment.canonicalUrl).not.toBe(post.canonicalUrl);
  });

  it("two comments in one thread stay two saves", () => {
    const a = n("https://www.reddit.com/r/programming/comments/abc123/title/def456/");
    const b = n("https://www.reddit.com/r/programming/comments/abc123/title/ghi789/");
    expect(a.externalId).not.toBe(b.externalId);
  });

  it("is unchanged for a plain post, with or without its slug", () => {
    expect(n("https://www.reddit.com/r/programming/comments/abc123/some_title/").externalId).toBe("abc123");
    expect(n("https://www.reddit.com/r/programming/comments/abc123/").externalId).toBe("abc123");
    expect(n("https://www.reddit.com/r/programming/comments/abc123/some_title/").canonicalUrl)
      .toBe("https://www.reddit.com/r/programming/comments/abc123/");
  });
});

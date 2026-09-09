import { describe, expect, it, vi } from "vitest";
import { resolveForSave } from "../lib/resolve-link";

const reply = (url: string) => ({ url }) as Response;
const SHARE = "https://www.reddit.com/r/Startup_Ideas/s/1WPsE6Zcas";
const REAL = "https://www.reddit.com/r/Startup_Ideas/comments/1wb6c07/here_are_40_subreddits/";

describe("following a share link before saving it", () => {
  it("hands the server the post a Reddit share link points at", async () => {
    const doFetch = vi.fn(async () => reply(REAL)) as unknown as typeof fetch;
    expect(await resolveForSave(SHARE, doFetch)).toBe(REAL);
  });

  it("does not touch a link that already points somewhere readable", async () => {
    const doFetch = vi.fn() as unknown as typeof fetch;
    for (const url of [REAL, "https://www.theverge.com/2026/9/9/x", "https://www.instagram.com/p/ABC123/"]) {
      expect(await resolveForSave(url, doFetch)).toBe(url);
    }
    expect(doFetch).not.toHaveBeenCalled(); // no network for links that need none
  });

  it("keeps the original when following fails, so a save is never lost to it", async () => {
    for (const failing of [
      async () => { throw new Error("offline"); },
      async () => reply(SHARE),                                  // redirected nowhere
      async () => reply("https://www.reddit.com/r/x/s/still"),   // landed on another share link
    ]) {
      expect(await resolveForSave(SHARE, failing as unknown as typeof fetch)).toBe(SHARE);
    }
  });

  it("leaves surrounding words intact when there is nothing to follow", async () => {
    const doFetch = vi.fn() as unknown as typeof fetch;
    expect(await resolveForSave(`  look at this ${REAL}  `, doFetch)).toBe(`look at this ${REAL}`);
  });
});

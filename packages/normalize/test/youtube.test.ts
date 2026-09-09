import { describe, expect, it } from "vitest";
import { parsePlaylistInput } from "../src/youtube";

const ok = (s: string) => { const r = parsePlaylistInput(s); return r.ok ? r.id : `FAILED:${r.reason}`; };

describe("reading a pasted playlist", () => {
  const ID = "PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb";

  it("takes the link however YouTube handed it over", () => {
    expect(ok(`https://www.youtube.com/playlist?list=${ID}`)).toBe(ID);
    expect(ok(`https://youtube.com/playlist?list=${ID}&si=abc`)).toBe(ID);
    expect(ok(`https://m.youtube.com/playlist?list=${ID}`)).toBe(ID);
    expect(ok(`https://music.youtube.com/playlist?list=${ID}`)).toBe(ID);
    // Copied while a video from the playlist was playing.
    expect(ok(`https://www.youtube.com/watch?v=WfJPBVXPt8k&list=${ID}&index=3`)).toBe(ID);
    expect(ok(`youtube.com/playlist?list=${ID}`)).toBe(ID);
    expect(ok(`  https://www.youtube.com/playlist?list=${ID}  `)).toBe(ID);
  });

  it("takes the bare id, which is what a hand-copy gives you", () => {
    expect(ok(ID)).toBe(ID);
  });

  it("says which of YouTube's own lists cannot be read, by name", () => {
    for (const [input, name] of [["WL", "Watch Later"], ["ll", "Liked videos"]] as const) {
      const r = parsePlaylistInput(input);
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.reason).toBe("closed"); expect(r.closed).toBe(name); }
    }
    // Also when they paste the whole link rather than the id.
    const r = parsePlaylistInput("https://www.youtube.com/playlist?list=WL");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("closed");
  });

  it("turns away what is not a playlist at all", () => {
    expect(ok("")).toBe("FAILED:empty");
    expect(ok("   ")).toBe("FAILED:empty");
    expect(ok("https://vimeo.com/12345")).toBe("FAILED:not_youtube");
    expect(ok("https://www.instagram.com/p/ABC123/")).toBe("FAILED:not_youtube");
    expect(ok("https://www.youtube.com/watch?v=WfJPBVXPt8k")).toBe("FAILED:no_playlist");
    expect(ok("https://www.youtube.com/")).toBe("FAILED:no_playlist");
    expect(ok("PLshort")).toBe("FAILED:no_playlist");
    expect(ok("not a url")).toBe("FAILED:not_youtube");
  });
});

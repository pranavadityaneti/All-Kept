import { describe, expect, it } from "vitest";
import { parseSavedExport } from "../src/saved-export.js";

/** The shape Instagram's export has used: a list under a named key, each entry a string map. */
const REAL_SHAPE = {
  saved_saved_media: [
    {
      title: "davidsenra",
      string_map_data: {
        "Saved on": { href: "https://www.instagram.com/reel/DcVMQIIMa5-/", timestamp: 1755772800 },
      },
    },
    {
      title: "nonna.kitchen",
      string_map_data: {
        "Saved on": { href: "https://www.instagram.com/p/ABC123xyz/", timestamp: 1700000000 },
      },
    },
  ],
};

describe("reading an Instagram saved-posts export", () => {
  it("takes the link, the shortcode, when it was saved and who posted it", () => {
    const entries = parseSavedExport(REAL_SHAPE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: "https://www.instagram.com/reel/DcVMQIIMa5-/",
      code: "DcVMQIIMa5-",
      kind: "reel",
      savedAt: "2025-08-21T10:40:00.000Z",
      author: "davidsenra",
    });
    expect(entries[1]!.author).toBe("nonna.kitchen");
  });

  it("returns them newest first", () => {
    const [first, second] = parseSavedExport(REAL_SHAPE);
    expect(first!.savedAt! > second!.savedAt!).toBe(true);
  });

  it("survives Meta renaming everything, because it looks for links rather than key names", () => {
    const renamed = { items: [{ owner_username: "someone", saved: { link: "https://instagram.com/reels/XYZ789abc", saved_time: "1750000000" } }] };
    expect(parseSavedExport(renamed)).toEqual([
      { url: "https://www.instagram.com/reel/XYZ789abc/", code: "XYZ789abc", kind: "reel", savedAt: "2025-06-15T15:06:40.000Z", author: "someone" },
    ]);
  });

  it("keeps one copy of a post saved twice, merging what each copy knows", () => {
    const twice = { a: [{ href: "https://www.instagram.com/p/DUP1abcdefg/" }], b: [{ title: "author", href: "https://www.instagram.com/p/DUP1abcdefg/", timestamp: 1700000000 }] };
    const entries = parseSavedExport(twice);
    expect(entries).toHaveLength(1);
    expect([entries[0]!.author, entries[0]!.savedAt]).toEqual(["author", "2023-11-14T22:13:20.000Z"]);
  });

  it("ignores links that are not posts, and documents with none", () => {
    expect(parseSavedExport({ x: "https://www.instagram.com/davidsenra/" })).toEqual([]);
    expect(parseSavedExport({ x: "https://example.com/p/ABC123/" })).toEqual([]);
    expect(parseSavedExport({})).toEqual([]);
    expect(parseSavedExport(null)).toEqual([]);
  });

  it("refuses a number that cannot be a save date", () => {
    const odd = { items: [{ href: "https://www.instagram.com/p/TIME1abcdef/", timestamp: 12, width: 1080 }] };
    expect(parseSavedExport(odd)[0]!.savedAt).toBeNull();
  });

  it("reads milliseconds as well as seconds", () => {
    const ms = { items: [{ href: "https://www.instagram.com/p/MS1abcdefgh/", taken_at: 1755772800000 }] };
    expect(parseSavedExport(ms)[0]!.savedAt).toBe("2025-08-21T10:40:00.000Z");
  });
});

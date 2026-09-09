import { describe, expect, it, vi } from "vitest";

// The picker and the Supabase client are native; only the pure decisions are checked here.
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));

const { looksLikeExport, storageKey } = await import("../lib/import");

describe("recognising Meta's export", () => {
  it("accepts the zip and the file inside it", () => {
    expect(looksLikeExport("instagram-pranav-2026-09-09.zip")).toBe(true);
    expect(looksLikeExport("saved_posts.json")).toBe(true);
    expect(looksLikeExport("SAVED_POSTS.JSON")).toBe(true);
    expect(looksLikeExport(" saved_posts.json ")).toBe(true);
  });

  it("turns away anything else", () => {
    expect(looksLikeExport("IMG_4021.HEIC")).toBe(false);
    expect(looksLikeExport("saved_posts.html")).toBe(false);
    expect(looksLikeExport("archive.zip.txt")).toBe(false);
    expect(looksLikeExport("")).toBe(false);
  });
});

describe("the key a file is stored under", () => {
  const user = "11111111-2222-3333-4444-555555555555";

  it("keeps the file in the person's own folder", () => {
    expect(storageKey(user, "saved_posts.json", 1757000000000)).toBe(`${user}/1757000000000-saved_posts.json`);
  });

  it("cannot be talked out of that folder", () => {
    const key = storageKey(user, "../../someone-else/steal.json", 1757000000000);
    expect(key.startsWith(`${user}/`)).toBe(true);
    expect(key.split("/")).toHaveLength(2);
    expect(key).not.toContain("..");
  });

  it("drops characters that do not belong in a key", () => {
    const key = storageKey(user, "my saves (2026)/#1.zip", 1757000000000);
    expect(key).toBe(`${user}/1757000000000-my-saves-2026-1.zip`);
  });

  it("still produces a name when there is nothing left of theirs", () => {
    expect(storageKey(user, "///", 1757000000000)).toBe(`${user}/1757000000000-export.zip`);
  });

  it("keeps the tail of a very long name, because the extension lives there", () => {
    const key = storageKey(user, `${"a".repeat(300)}.zip`, 1757000000000);
    expect(key.endsWith(".zip")).toBe(true);
    expect(key.length).toBeLessThan(user.length + 80);
  });
});

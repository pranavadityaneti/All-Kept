import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
import { otherView, parseLibraryView, rowMeta } from "../lib/library-view";
import type { LibraryItem } from "../lib/library";

const item: LibraryItem = {
  id: "i1", platform: "tiktok", kind: "short_video", status: "ready", classificationStatus: "ready", title: "10 startups that don't exist yet", text: null,
  authorName: "Sam", authorHandle: "sam", canonicalUrl: "https://www.tiktok.com/@sam/video/1", sourceUrl: null, thumbnailPath: null,
  lastSavedAt: "2026-09-12T10:00:00Z", saveCount: 1, category: "Money & career", tags: [], summary: null,
};

describe("how the library is shown", () => {
  it("remembers grid or list, and reads anything else as the grid", () => {
    expect(parseLibraryView("list")).toBe("list");
    expect(parseLibraryView("grid")).toBe("grid");
    expect(parseLibraryView(null)).toBe("grid");
    expect(parseLibraryView("mosaic")).toBe("grid");
  });
  it("names the view a tap would switch to", () => {
    expect(otherView("grid")).toBe("list");
    expect(otherView("list")).toBe("grid");
  });
  it("puts the category, the source and the day saved under a row's title", () => {
    expect(rowMeta(item)).toBe("Career · TikTok · 12 Sep");
    expect(rowMeta({ ...item, category: null, classificationStatus: "queued" })).toBe("Sorting · TikTok · 12 Sep");
    expect(rowMeta({ ...item, platform: "web", canonicalUrl: "https://razorpay.com/learn/x" })).toBe("Career · razorpay.com · 12 Sep");
  });
});

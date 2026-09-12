import { describe as group, expect, it } from "vitest";

import { statusNote } from "../lib/sorting";
import { describe as activityNote } from "../lib/activity";
import type { LibraryItem } from "../lib/library";

const item = (over: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "i", platform: "tiktok", kind: "image", status: "preview_unavailable", classificationStatus: "ready",
  title: null, text: null, authorName: null, canonicalUrl: null, sourceUrl: null, thumbnailPath: null,
  category: null, lastSavedAt: new Date().toISOString(), saveCount: 1, ...over,
} as LibraryItem);

group("what a card says about itself", () => {
  it("says nothing is there only when nothing is", () => {
    expect(statusNote(item())).toBe("No preview");
  });
  it("does not call a save with a picture 'no preview', whatever the platform said", () => {
    // TikTok describes no photo post, so the status stays preview_unavailable — but the phone found
    // the picture from the page and the card is showing it. Saying otherwise contradicts itself.
    expect(statusNote(item({ thumbnailPath: "u1/i.jpg" }))).toBeNull();
  });
  it("still says so for a save with no link", () => {
    expect(statusNote(item({ status: "no_link" }))).toBe("No link");
    expect(statusNote(item({ status: "no_link", thumbnailPath: "u1/i.jpg" }))).toBe("No link");
  });
  it("the activity line agrees with the card", () => {
    expect(activityNote("preview_unavailable", "Tech", false)).toBe("Saved as Tech, no preview");
    expect(activityNote("preview_unavailable", "Tech", true)).toBe("Saved as Tech");
  });
});

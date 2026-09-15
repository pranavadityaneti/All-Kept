import { describe, expect, it } from "vitest";
import { categoryLabel, canRetrySorting, canSortAgain, isUnsure, sortingNote, summaryNote } from "../lib/sorting";

describe("sorting states", () => {
  it("never labels terminal preview or classification failure as still sorting", () => {
    for (const item of [
      { status: "failed", classificationStatus: "queued" as const, category: null },
      { status: "ready", classificationStatus: "failed" as const, category: null },
    ]) {
      expect(categoryLabel(item)).toBe("Needs attention");
      expect(sortingNote(item)).not.toBe("Sorting…");
      expect(canRetrySorting(item)).toBe(true);
    }
  });
  it("keeps chosen categories visible while a retry is scheduled", () => {
    const item = { status: "no_link", classificationStatus: "retry_wait" as const, category: "Food & recipes" };
    expect(categoryLabel(item)).toBe("Food");
    expect(sortingNote(item)).toBe("Retry scheduled");
    expect(canRetrySorting(item)).toBe(true);
  });
  it("separates preview availability from sorting completion", () => {
    const item = { status: "preview_unavailable", classificationStatus: "ready" as const, category: "Tech & tools" };
    expect(sortingNote(item)).toBeNull();
    expect(canRetrySorting(item)).toBe(false);
  });
});

describe("sorting again, and the sorter's own doubt", () => {
  it("offers Sort again only on a save that is sorted and whose page is settled", () => {
    expect(canSortAgain({ status: "ready", classificationStatus: "ready", category: "Tech & tools" })).toBe(true);
    expect(canSortAgain({ status: "no_link", classificationStatus: "ready", category: "Other" })).toBe(true);
    expect(canSortAgain({ status: "ready", classificationStatus: "retry_wait", category: null })).toBe(false);
    expect(canSortAgain({ status: "pending", classificationStatus: "ready", category: null })).toBe(false);
  });
  it("says the sorter was unsure below its floor, unless the person has already answered", () => {
    const sorted = { status: "ready", classificationStatus: "ready" as const, category: "Other", corrected: false };
    expect(isUnsure({ ...sorted, confidence: 0.3 })).toBe(true);
    expect(isUnsure({ ...sorted, confidence: 0.4 })).toBe(false);
    expect(isUnsure({ ...sorted, confidence: null })).toBe(false);
    expect(isUnsure({ ...sorted, confidence: 0.3, corrected: true })).toBe(false);
    expect(isUnsure({ ...sorted, confidence: 0.3, classificationStatus: "retry_wait" })).toBe(false);
  });
  it("names the languages when the summary was written in another language than the post", () => {
    expect(summaryNote({ language: "ja", summaryLanguage: "en" })).toBe("Summary written in English · the post is in Japanese");
    expect(summaryNote({ language: "en", summaryLanguage: "en" })).toBeNull();
    expect(summaryNote({ language: "und", summaryLanguage: "en" })).toBeNull();
    expect(summaryNote({ language: null, summaryLanguage: "en" })).toBeNull();
    expect(summaryNote({ language: "ja", summaryLanguage: null })).toBeNull();
    // A code the runtime cannot name is shown as itself rather than nothing.
    expect(summaryNote({ language: "xx", summaryLanguage: "en" })).toBe("Summary written in English · the post is in xx");
  });
});

import { describe, expect, it } from "vitest";
import { categoryLabel, canRetrySorting, sortingNote } from "../lib/sorting";

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

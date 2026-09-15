import { describe, expect, it } from "vitest";
import { doneLine, doneVerb } from "../lib/done";

describe("marking a save done", () => {
  it("names the deed after what the sorter thought the save was for", () => {
    expect(doneVerb("watch")).toBe("Watched");
    expect(doneVerb("try")).toBe("Tried");
    expect(doneVerb("buy")).toBe("Bought");
    expect(doneVerb("go")).toBe("Been");
    expect(doneVerb("read")).toBe("Read");
    expect(doneVerb("reference")).toBe("Done");
    expect(doneVerb(null)).toBe("Done");
  });
  it("says when, and the journal line when there is one", () => {
    expect(doneLine({ doneAt: "2026-09-12T10:00:00Z", journal: "went in June, worth it", intent: "go" })).toBe("Been · 12 Sep — went in June, worth it");
    expect(doneLine({ doneAt: "2026-09-12T10:00:00Z", journal: null, intent: "watch" })).toBe("Watched · 12 Sep");
    expect(doneLine({ doneAt: null, journal: "x", intent: "go" })).toBeNull();
  });
});

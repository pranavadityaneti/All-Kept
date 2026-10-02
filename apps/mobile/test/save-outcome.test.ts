import { describe, expect, it } from "vitest";
import { saveOutcome } from "../lib/save-outcome";

describe("what the paste field says after a save", () => {
  it("never claims more than happened, and says so when a note went with it", () => {
    expect(saveOutcome({ deduplicated: false, status: "ready" }, false)).toBe("Saved.");
    expect(saveOutcome({ deduplicated: false, status: "ready" }, true)).toBe("Saved, with your note.");
    expect(saveOutcome({ deduplicated: false, status: "pending" }, false)).toBe("Saved. Sorting it now.");
    expect(saveOutcome({ deduplicated: false, status: "pending" }, true)).toBe("Saved, with your note. Sorting it now.");
  });
  it("a link already kept is not saved twice — but a note typed with it is added, and says so", () => {
    expect(saveOutcome({ deduplicated: true, status: "ready" }, false)).toBe("Already saved.");
    expect(saveOutcome({ deduplicated: true, status: "pending" }, true)).toBe("Already saved. Your note was added.");
  });
});

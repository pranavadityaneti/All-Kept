import { describe, expect, it } from "vitest";
import { formatCountdown, secondsLeft } from "../lib/countdown";

describe("countdown", () => {
  it("counts whole seconds to the expiry and never goes negative", () => {
    const now = Date.parse("2026-09-08T10:00:00.000Z");
    expect(secondsLeft("2026-09-08T10:10:00.000Z", now)).toBe(600);
    expect(secondsLeft("2026-09-08T10:00:00.400Z", now)).toBe(1);
    expect(secondsLeft("2026-09-08T09:59:00.000Z", now)).toBe(0);
    expect(secondsLeft("not a date", now)).toBe(0);
  });

  it("formats minutes and padded seconds", () => {
    expect([formatCountdown(600), formatCountdown(61), formatCountdown(9), formatCountdown(0), formatCountdown(-5)])
      .toEqual(["10:00", "1:01", "0:09", "0:00", "0:00"]);
  });
});

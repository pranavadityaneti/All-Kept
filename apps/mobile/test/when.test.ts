import { describe, expect, it } from "vitest";
import { dayDate, dayValue, describeDay, describeRange, describeTime, timeDate, timeValue } from "../lib/when";

describe("a day and a time, picked rather than typed", () => {
  it("writes a picked day as the brief carries it, from the phone's own calendar", () => {
    // Half past midnight on the 6th: read through UTC, as toISOString does, this is the 5th east of Greenwich.
    expect(dayValue(new Date(2026, 9, 6, 0, 30))).toBe("2026-10-06");
    expect(dayValue(new Date(2026, 0, 9, 23, 59))).toBe("2026-01-09");
  });

  it("writes a picked time on the 24-hour clock", () => {
    expect(timeValue(new Date(2026, 9, 6, 14, 5))).toBe("14:05");
    expect(timeValue(new Date(2026, 9, 6, 0, 0))).toBe("00:00");
  });

  it("opens the picker on what was picked", () => {
    const day = dayDate("2026-10-06");
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 9, 6, 0]);
    const time = timeDate("14:30", new Date(2026, 9, 2, 9, 0));
    expect([time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), time.getMinutes()]).toEqual([2026, 9, 2, 14, 30]);
  });

  it("goes there and back without moving", () => {
    expect(dayValue(dayDate("2026-12-31"))).toBe("2026-12-31");
    expect(timeValue(timeDate("23:59", new Date(2026, 9, 2)))).toBe("23:59");
  });

  it("says a day and a time the way the rest of the app does", () => {
    const now = new Date(2026, 9, 2);
    expect(describeDay("2026-10-06", now)).toBe("Tue 6 Oct");
    expect(describeDay("2027-01-05", now)).toBe("Tue 5 Jan 2027");
    expect(describeTime("14:30")).toBe("2:30 pm");
    expect(describeTime("00:05")).toBe("12:05 am");
    expect(describeTime("12:00")).toBe("12:00 pm");
  });

  it("says a trip's days as a range, the month once when it doesn't change", () => {
    const now = new Date(2026, 9, 2);
    expect(describeRange("2026-10-06", 7, now)).toBe("Tue 6 – Mon 12 Oct");
    expect(describeRange("2026-10-28", 7, now)).toBe("Wed 28 Oct – Tue 3 Nov");
    expect(describeRange("2026-12-29", 5, now)).toBe("Tue 29 Dec – Sat 2 Jan 2027");
    expect(describeRange("2026-10-06", 1, now)).toBe("Tue 6 Oct");
  });
});

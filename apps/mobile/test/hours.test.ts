import { describe, expect, it } from "vitest";
import { hoursLine, openNow, type OpeningPeriod } from "../lib/hours";

// A café in Hyderabad (UTC+5:30): Mon–Sat 9 AM to 11 PM, Sunday 10 AM to 4 PM, and Friday runs past midnight.
const week: OpeningPeriod[] = [
  { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } },
  ...[1, 2, 3, 4].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 23, minute: 0 } })),
  { open: { day: 5, hour: 9, minute: 0 }, close: { day: 6, hour: 1, minute: 30 } },
  { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 23, minute: 0 } },
];
const ist = 330;
// Tuesday 15 Sep 2026, 14:30 IST is 09:00 UTC.
const tuesdayAfternoon = new Date("2026-09-15T09:00:00Z");

describe("whether a place is open now, on its own clock", () => {
  it("is open inside a period, and says when it closes", () => {
    expect(openNow(week, ist, tuesdayAfternoon)).toEqual({ state: "open", until: { day: 2, hour: 23, minute: 0 } });
  });
  it("is closed between periods, and says when it next opens — today, or another day", () => {
    // Tuesday 23:30 IST is 18:00 UTC: closed, opens Wednesday 9 AM.
    expect(openNow(week, ist, new Date("2026-09-15T18:00:00Z"))).toEqual({ state: "closed", next: { day: 3, hour: 9, minute: 0 } });
    // Sunday 8 AM IST is Saturday 02:30 UTC: closed, opens today at 10.
    expect(openNow(week, ist, new Date("2026-09-20T02:30:00Z"))).toEqual({ state: "closed", next: { day: 0, hour: 10, minute: 0 } });
  });
  it("reads the place's clock, not the phone's: the same instant is a different hour elsewhere", () => {
    // 09:00 UTC is 5 AM in New York (UTC-4): closed there, opens at 9.
    expect(openNow(week, -240, tuesdayAfternoon)).toEqual({ state: "closed", next: { day: 2, hour: 9, minute: 0 } });
  });
  it("follows a period past midnight into the next day", () => {
    // Saturday 00:45 IST is Friday 19:15 UTC: still Friday's opening, closing at 1:30.
    expect(openNow(week, ist, new Date("2026-09-18T19:15:00Z"))).toEqual({ state: "open", until: { day: 6, hour: 1, minute: 30 } });
  });
  it("is open around the clock when the one period never closes, and knows nothing without periods or a clock", () => {
    expect(openNow([{ open: { day: 0, hour: 0, minute: 0 } }], ist, tuesdayAfternoon)).toEqual({ state: "open", until: null });
    expect(openNow(null, ist, tuesdayAfternoon)).toBeNull();
    expect(openNow(week, null, tuesdayAfternoon)).toBeNull();
    expect(openNow([], ist, tuesdayAfternoon)).toBeNull();
  });
});

describe("the line under the place", () => {
  it("says open with the closing time, closed with the next opening, or open around the clock", () => {
    expect(hoursLine(week, ist, tuesdayAfternoon)).toBe("Open now · until 11 PM");
    expect(hoursLine(week, ist, new Date("2026-09-15T18:00:00Z"))).toBe("Closed · opens 9 AM");
    expect(hoursLine(week, ist, new Date("2026-09-18T19:15:00Z"))).toBe("Open now · until 1:30 AM");
    expect(hoursLine([{ open: { day: 0, hour: 0, minute: 0 } }], ist, tuesdayAfternoon)).toBe("Open 24 hours");
    expect(hoursLine(null, ist, tuesdayAfternoon)).toBeNull();
  });
  it("names the day when the next opening is more than a day away, and not when it is tonight's tomorrow", () => {
    // Sunday 17:00 IST, closed since 4: opens Monday at 9, sixteen hours on — "9 AM" reads as tomorrow morning.
    expect(hoursLine(week, ist, new Date("2026-09-20T11:30:00Z"))).toBe("Closed · opens 9 AM");
    // A place open on Mondays alone, asked on a Tuesday: the day has to be said.
    const mondays: OpeningPeriod[] = [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }];
    expect(hoursLine(mondays, ist, tuesdayAfternoon)).toBe("Closed · opens Mon 9 AM");
  });
});

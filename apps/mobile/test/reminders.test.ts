import { describe, expect, it, vi } from "vitest";
vi.mock("expo-notifications", () => ({}));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { describeReminder, presetTimes, reconcileReminders } from "../lib/reminders";

// A Wednesday afternoon, 15:00 local.
const wed = new Date(2026, 8, 16, 15, 0);
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo, d, h, mi).getTime();

describe("the reminder presets", () => {
  it("offer tonight while there is still an evening, then tomorrow morning, the weekend and next week", () => {
    expect(presetTimes(wed).map((p) => [p.label, p.at])).toEqual([
      ["Tonight 8pm", at(2026, 8, 16, 20)],
      ["Tomorrow 9am", at(2026, 8, 17, 9)],
      ["This weekend", at(2026, 8, 19, 10)],
      ["Next week", at(2026, 8, 21, 9)],
    ]);
  });
  it("drop tonight once the evening is nearly gone, and move the weekend on when it is already here", () => {
    const late = new Date(2026, 8, 16, 19, 45);
    expect(presetTimes(late).map((p) => p.label)).toEqual(["Tomorrow 9am", "This weekend", "Next week"]);
    const saturdayNoon = new Date(2026, 8, 19, 12, 0);
    expect(presetTimes(saturdayNoon).find((p) => p.label === "This weekend")!.at).toBe(at(2026, 8, 26, 10));
    const monday = new Date(2026, 8, 21, 8, 0);
    expect(presetTimes(monday).find((p) => p.label === "Next week")!.at).toBe(at(2026, 8, 28, 9));
  });
});

describe("how a reminder reads", () => {
  it("says today, tomorrow, or the day, with the time", () => {
    expect(describeReminder(at(2026, 8, 16, 20), wed)).toBe("Today, 8:00 pm");
    expect(describeReminder(at(2026, 8, 17, 9), wed)).toBe("Tomorrow, 9:00 am");
    expect(describeReminder(at(2026, 8, 19, 10, 30), wed)).toBe("Sat 19 Sep, 10:30 am");
    expect(describeReminder(at(2027, 0, 4, 9), wed)).toBe("Mon 4 Jan 2027, 9:00 am");
  });
});

describe("keeping the phone's schedule and the server's list the same", () => {
  it("schedules what the server has and the phone lacks or has at another time, and cancels what the server no longer has", () => {
    const server = [{ id: "a", at: 100 }, { id: "b", at: 200 }, { id: "c", at: 300 }];
    const phone = [{ id: "a", at: 100 }, { id: "b", at: 250 }, { id: "z", at: 900 }];
    expect(reconcileReminders(server, phone)).toEqual({ schedule: [{ id: "b", at: 200 }, { id: "c", at: 300 }], cancel: ["z"] });
    expect(reconcileReminders([], [])).toEqual({ schedule: [], cancel: [] });
  });
});

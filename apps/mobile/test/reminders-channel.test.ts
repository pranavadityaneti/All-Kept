import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  os: { OS: "android" as "android" | "ios" },
  channel: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), scheduled: vi.fn(), rows: [] as { id: string; remind_at: string; title: string | null; text: string | null }[],
}));
vi.mock("react-native", () => ({ Platform: m.os }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: m.channel, scheduleNotificationAsync: m.schedule, cancelScheduledNotificationAsync: m.cancel, getAllScheduledNotificationsAsync: m.scheduled,
  SchedulableTriggerInputTypes: { DATE: "date" }, AndroidImportance: { HIGH: 4 }, AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock("../lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ gt: async () => ({ data: m.rows, error: null }) }) }) } }));
import { scheduleReminder, syncReminders } from "../lib/reminders";

const T = Date.parse("2026-10-10T09:00:00Z"), T2 = Date.parse("2026-10-11T09:00:00Z");
/** A reminder as the phone holds it: its id, its time, and the channel it was scheduled on (none before this change). */
const held = (id: string, at: number, channelId: string | null) => ({ identifier: `reminder:${id}`, content: { data: { itemId: id, at } }, trigger: { type: "date", value: at, channelId } });
beforeEach(() => {
  vi.clearAllMocks(); m.os.OS = "android"; m.rows = [];
  for (const f of [m.channel, m.schedule, m.cancel]) f.mockResolvedValue(undefined);
  m.scheduled.mockResolvedValue([]);
});

describe("a reminder's own place on Android", () => {
  it("goes to its own channel — 'Reminders you set', popping up, and private: a locked screen shows no title", async () => {
    await scheduleReminder("i1", T, "A ramen place");
    expect(m.channel).toHaveBeenCalledWith("reminders", { name: "Reminders you set", importance: 4, lockscreenVisibility: 0 });
    expect(m.channel.mock.invocationCallOrder[0]!).toBeLessThan(m.schedule.mock.invocationCallOrder[0]!);
    expect(m.schedule.mock.calls[0]![0].trigger).toEqual({ type: "date", date: new Date(T), channelId: "reminders" });
  });

  it("the channel is made when the app syncs its reminders — at launch and each return — not only when one is set", async () => {
    await syncReminders();
    expect(m.channel).toHaveBeenCalledWith("reminders", expect.objectContaining({ name: "Reminders you set" }));
  });

  it("reminders scheduled before they had their own channel are moved onto it; one the server no longer has is only cancelled", async () => {
    m.rows = [{ id: "i1", remind_at: new Date(T).toISOString(), title: "A ramen place", text: null }];
    m.scheduled.mockResolvedValue([held("i1", T, null), held("i2", T2, null)]);
    await syncReminders();
    expect(m.cancel.mock.calls.map((c) => c[0]).sort()).toEqual(["reminder:i1", "reminder:i2"]);
    expect(m.schedule).toHaveBeenCalledTimes(1);
    expect(m.schedule.mock.calls[0]![0]).toMatchObject({ identifier: "reminder:i1", trigger: { channelId: "reminders" } });
  });

  it("one already on its channel is left as it is", async () => {
    m.rows = [{ id: "i1", remind_at: new Date(T).toISOString(), title: "A ramen place", text: null }];
    m.scheduled.mockResolvedValue([held("i1", T, "reminders")]);
    await syncReminders();
    expect([m.cancel.mock.calls.length, m.schedule.mock.calls.length]).toEqual([0, 0]);
  });

  it("an iPhone has no channels: none is made, and nothing is moved", async () => {
    m.os.OS = "ios";
    m.rows = [{ id: "i1", remind_at: new Date(T).toISOString(), title: "A ramen place", text: null }];
    m.scheduled.mockResolvedValue([{ identifier: "reminder:i1", content: { data: { itemId: "i1", at: T } }, trigger: { type: "date", value: T } }]);
    await syncReminders();
    await scheduleReminder("i3", T2, "x");
    expect(m.channel).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });
});

import { describe as suite, expect, it } from "vitest";
import { dayLabel, describe, entriesFor, groupByDay, groupEntries, when } from "../lib/activity";
import type { LibraryItem } from "../lib/library";

const save = (id: string, savedAt: string): LibraryItem =>
  ({ id, lastSavedAt: savedAt, platform: "instagram" } as unknown as LibraryItem);

suite("the activity list", () => {
  it("groups by calendar day, not by hours elapsed", () => {
    // Saved at 11pm, read at 1am. Two hours ago, but a different day — and the heading has to say
    // so, or last night's saves sit under TODAY every morning.
    const now = new Date(2026, 8, 10, 1, 0);
    expect(dayLabel(new Date(2026, 8, 9, 23, 0).toISOString(), now)).toBe("YESTERDAY");
    expect(dayLabel(new Date(2026, 8, 10, 0, 5).toISOString(), now)).toBe("TODAY");
  });

  it("names older days outright and never labels the future as past", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    expect(dayLabel(new Date(2026, 8, 7, 9, 0).toISOString(), now)).toMatch(/2026/);
    expect(dayLabel(new Date(2026, 8, 7, 9, 0).toISOString(), now)).toBe(
      new Date(2026, 8, 7).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }).toUpperCase(),
    );
    // A clock skewed forward must not produce "-1 days ago" nonsense.
    expect(dayLabel(new Date(2026, 8, 11, 9, 0).toISOString(), now)).toBe("TODAY");
  });

  it("keeps the order it was given and opens a new section only when the day turns", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    const sections = groupByDay([
      save("a", new Date(2026, 8, 10, 11, 0).toISOString()),
      save("b", new Date(2026, 8, 10, 9, 0).toISOString()),
      save("c", new Date(2026, 8, 9, 20, 0).toISOString()),
      save("d", new Date(2026, 8, 7, 8, 0).toISOString()),
    ], now);
    expect(sections.map((s) => s.title)).toEqual(["TODAY", "YESTERDAY", expect.stringMatching(/2026/)]);
    expect(sections[0]!.data.map((i) => i.id)).toEqual(["a", "b"]);
    expect(sections[1]!.data.map((i) => i.id)).toEqual(["c"]);
  });

  it("has nothing to group when nothing has arrived", () => {
    expect(groupByDay([], new Date())).toEqual([]);
  });

  it("lists a reminder that has fired beside the saves, at the time it fired, newest first", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    const a = save("a", new Date(2026, 8, 10, 11, 0).toISOString());
    const b = save("b", new Date(2026, 8, 8, 9, 0).toISOString());
    const reminded = { ...save("b", b.lastSavedAt), remindAt: new Date(2026, 8, 10, 9, 30).toISOString() };
    const entries = entriesFor([a, b], [reminded]);
    expect(entries.map((e) => [e.key, e.kind])).toEqual([["saved:a", "saved"], ["reminder:b", "reminder"], ["saved:b", "saved"]]);
    const sections = groupEntries(entries, now);
    expect(sections.map((s) => [s.title, s.data.map((e) => e.key)])).toEqual([["TODAY", ["saved:a", "reminder:b"]], [expect.stringMatching(/2026/), ["saved:b"]]]);
    // A reminder still to come is not an entry: nothing has happened yet.
    expect(entriesFor([], [{ ...reminded, remindAt: new Date(2026, 8, 12, 9, 0).toISOString() }], now).length).toBe(0);
  });

  it("reads a timestamp the way a notification does", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    expect(when("2026-09-10T11:59:40Z", now)).toBe("just now");
    expect(when("2026-09-10T11:45:00Z", now)).toBe("15m ago");
    expect(when("2026-09-10T10:00:00Z", now)).toBe("2h ago");
    expect(when("2026-09-07T12:00:00Z", now)).toBe("3d ago");
    // A save timestamped slightly ahead of the phone's clock reads as now, never as negative.
    expect(when("2026-09-10T12:05:00Z", now)).toBe("just now");
  });

  it("says what actually happened to the save, including when sorting has not finished", () => {
    expect(describe("ready", "Tech & tools")).toBe("Saved as Tech & tools");
    expect(describe("ready", null)).toBe("Saved");
    expect(describe("pending", "Tech & tools")).toBe("Saved, still sorting");
    expect(describe("no_link", null)).toBe("Saved, no link yet");
    expect(describe("preview_unavailable", "Money & career")).toBe("Saved as Money & career, no preview");
  });
});

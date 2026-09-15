import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { playlistDetail } from "../lib/sources";

describe("the YouTube row in Settings", () => {
  it("says a playlist is paused for want of a subscription, and how many when there are several", () => {
    expect(playlistDetail({ connected: 1, pausedForPayment: 1 })).toBe("Paused — subscription ended. Resumes when you renew.");
    expect(playlistDetail({ connected: 3, pausedForPayment: 2 })).toBe("2 of 3 paused — subscription ended. Resume when you renew.");
  });
  it("otherwise says what the row is for", () => {
    expect(playlistDetail({ connected: 2, pausedForPayment: 0 })).toBe("Save a video to a playlist and it lands here");
    expect(playlistDetail(null)).toBe("Save a video to a playlist and it lands here");
  });
});

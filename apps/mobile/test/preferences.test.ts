import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { DEFAULT_PREFERENCES } from "../lib/preferences";

describe("what an account that has never answered reads as", () => {
  it("notifications are off until the person says yes — a phone that allowed them for something else (a reminder) is not a yes", () => {
    expect(DEFAULT_PREFERENCES.notifyEnabled).toBe(false);
  });

  it("the switches under it, and sorting, keep their defaults: they only matter once the person has said yes", () => {
    expect([DEFAULT_PREFERENCES.notifySorted, DEFAULT_PREFERENCES.notifyAttention, DEFAULT_PREFERENCES.aiSortingEnabled, DEFAULT_PREFERENCES.interestsEnabled]).toEqual([true, true, true, null]);
  });
});

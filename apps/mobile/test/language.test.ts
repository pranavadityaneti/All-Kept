import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { shouldSendLanguage } from "../lib/language";

describe("telling the server the phone's language", () => {
  it("sends it the first time and whenever it changed, and not otherwise", () => {
    expect(shouldSendLanguage("en", null)).toBe(true);
    expect(shouldSendLanguage("ja", "en")).toBe(true);
    expect(shouldSendLanguage("en", "en")).toBe(false);
  });
});

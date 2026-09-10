import { describe, expect, it } from "vitest";
import { normalizePhone, validateProfile, profileComplete } from "../lib/profile-fields";
import { authDestination, stateFromSession } from "../lib/auth-state";
const valid = { name: "  Pranav  ", phone: "", avatarPath: "owner/photo.jpg" };
describe("profile validation", () => {
  it("requires a photo and a name, allows no phone, and asks nothing else", () => {
    expect(validateProfile(valid)).toMatchObject({ display_name: "Pranav", phone: null });
    for (const patch of [{ avatarPath: null }, { name: " " }]) expect(() => validateProfile({ ...valid, ...patch })).toThrow();
  });
  it("normalizes international phone numbers and rejects ambiguous local numbers", () => {
    expect(normalizePhone("+91 (98765) 43210")).toBe("+919876543210");
    expect(normalizePhone(" ")).toBeNull();
    for (const phone of ["9876543210", "+01234567", "+123", "+1234567890123456", "+91abc"]) expect(() => normalizePhone(phone)).toThrow();
  });
  it("never returns a gender field, whatever it is handed", () => {
    // Guards the removal: an old draft restored from the keychain still carries these keys, and
    // they must not find their way back into an update.
    const saved = validateProfile({ ...valid, gender: "man", genderCustom: "x" } as never);
    expect(Object.keys(saved).some((k) => k.startsWith("gender"))).toBe(false);
  });
});
describe("onboarding gate", () => {
  it("starts signed out without inventing a guest", () => {
    expect(stateFromSession(null)).toEqual({ status: "signed_out" });
    expect(authDestination({ status: "signed_out" }, false)).toBe("welcome");
  });
  it("requires server-confirmed profile completion", () => {
    const profile = { user_id: "user", display_name: "Pranav", phone: null, avatar_path: "user/p.jpg", onboarding_completed_at: null };
    expect(profileComplete(profile)).toBe(false);
    expect(profileComplete({ ...profile, onboarding_completed_at: "2026-09-09" })).toBe(true);
    expect(profileComplete({ ...profile, onboarding_completed_at: "2026-09-09", avatar_path: null })).toBe(false);
  });
});

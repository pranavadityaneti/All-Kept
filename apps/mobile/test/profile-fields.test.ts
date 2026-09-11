import { describe, expect, it } from "vitest";
import { validateProfile, profileComplete } from "../lib/profile-fields";
import { authDestination, stateFromSession } from "../lib/auth-state";
const valid = { name: "  Pranav  ", avatarPath: null };
describe("profile validation", () => {
  it("requires a name and nothing else", () => {
    expect(validateProfile(valid)).toEqual({ display_name: "Pranav", avatar_path: null });
    expect(() => validateProfile({ ...valid, name: " " })).toThrow();
    expect(() => validateProfile({ ...valid, name: "x".repeat(81) })).toThrow();
  });
  it("keeps a chosen photo, and accepts none", () => {
    expect(validateProfile({ ...valid, avatarPath: "owner/photo.jpg" })).toEqual({ display_name: "Pranav", avatar_path: "owner/photo.jpg" });
  });
  it("never returns a phone or gender field, whatever it is handed", () => {
    // Guards the removals: an old draft restored from the keychain still carries these keys, and
    // they must not find their way back into an update.
    const saved = validateProfile({ ...valid, phone: "+919876543210", gender: "man", genderCustom: "x" } as never);
    expect(Object.keys(saved)).toEqual(["display_name", "avatar_path"]);
  });
});
describe("onboarding gate", () => {
  it("starts signed out without inventing a guest", () => {
    expect(stateFromSession(null)).toEqual({ status: "signed_out" });
    expect(authDestination({ status: "signed_out" }, false)).toBe("welcome");
  });
  it("requires server-confirmed completion, with or without a photo", () => {
    const profile = { user_id: "user", display_name: "Pranav", avatar_path: null, onboarding_completed_at: null };
    expect(profileComplete(profile)).toBe(false);
    expect(profileComplete({ ...profile, onboarding_completed_at: "2026-09-11" })).toBe(true);
    expect(profileComplete({ ...profile, onboarding_completed_at: "2026-09-11", avatar_path: "user/p.jpg" })).toBe(true);
    expect(profileComplete({ ...profile, onboarding_completed_at: "2026-09-11", display_name: null })).toBe(false);
  });
});

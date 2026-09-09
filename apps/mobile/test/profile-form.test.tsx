import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pick: vi.fn(), bytes: vi.fn(), upload: vi.fn(), update: vi.fn(), single: vi.fn(), remove: vi.fn(), draft: new Map<string,string>() }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", KeyboardAvoidingView: "KeyboardAvoidingView", ActivityIndicator: "ActivityIndicator", Platform: { OS: "ios" }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} } }));
vi.mock("expo-image", () => ({ Image: "Image" }));
vi.mock("../components/Icon", () => ({ Icon: "Icon" }));
vi.mock("../lib/theme", () => ({ usePalette: () => ({}), type: { body: {}, label: {}, heading: {} }, space: { sm: 8, md: 16, lg: 24 }, radius: { md: 12 } }));
vi.mock("../lib/profile", () => ({ useAvatar: () => ({ data: null }), profileKey: (id: string) => ["profile",id] }));
vi.mock("../lib/profile-photo", () => ({ pickProfilePhoto: mocks.pick, photoBytes: mocks.bytes, removeDraftPhoto: vi.fn() }));
vi.mock("../lib/storage", () => ({ chunkedSecureStore: { getItem: async (k: string) => mocks.draft.get(k) ?? null, setItem: async (k: string,v: string) => { mocks.draft.set(k,v); }, removeItem: async (k: string) => { mocks.draft.delete(k); } } }));
vi.mock("../lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) }, from: () => ({ update: (v: unknown) => { mocks.update(v); return { eq: () => ({ select: () => ({ single: mocks.single }) }) }; } }) } }));
import { ProfileForm } from "../components/ProfileForm";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import type { Profile } from "../lib/profile-fields";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const profile: Profile = { user_id: "owner", display_name: null, gender: null, gender_custom: null, phone: null, avatar_path: null, onboarding_completed_at: null };
beforeEach(() => { vi.clearAllMocks(); mocks.draft.clear(); mocks.pick.mockResolvedValue("file:///draft.jpg"); mocks.bytes.mockResolvedValue(new ArrayBuffer(2)); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null }); mocks.single.mockResolvedValue({ data: { ...profile, display_name: "Pranav", gender: "man", avatar_path: "owner/new.jpg", onboarding_completed_at: "2026-09-09" }, error: null }); });
async function renderForm() {
  let view!: ReactTestRenderer;
  const saved = vi.fn();
  await act(async () => { view = create(<QueryClientProvider client={new QueryClient()}><ProfileForm profile={profile} suggestedName="Pranav" onboarding onSaved={saved} /></QueryClientProvider>); });
  return { view, saved };
}
const press = async (view: ReactTestRenderer, label: string) => { await act(async () => { await view.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress(); }); };
describe("profile form", () => {
  it("places the photo before name, gender and phone", async () => {
    const { view } = await renderForm();
    const fields = view.root.findAll((n) => n.props.accessibilityLabel === "Add profile photo" || String(n.type) === "TextInput" || n.type === Chip);
    expect(fields[0]!.props.accessibilityLabel).toBe("Add profile photo");
    expect(fields[1]!.props.accessibilityLabel).toBe("Name");
    expect(fields[2]!.type).toBe(Chip);
    expect(fields.at(-1)!.props.accessibilityLabel).toContain("Phone");
    await act(async () => view.unmount());
  });
  it("retains entered fields after upload failure and completes only after retry succeeds", async () => {
    const { view, saved } = await renderForm();
    await press(view, "Add profile photo");
    await act(async () => { view.root.findAllByType(Chip).find((c) => c.props.label === "Man")!.props.onPress(); });
    mocks.upload.mockResolvedValueOnce({ error: new Error("network") });
    await press(view, "Save and continue");
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(view.root.findByProps({ accessibilityLabel: "Name" }).props.value).toBe("Pranav");
    await press(view, "Save and continue");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Pranav", gender: "man", phone: null }));
    expect(saved).toHaveBeenCalledOnce();
    expect(mocks.draft.size).toBe(0);
    await act(async () => view.unmount());
  });
  it("retries a failed profile write without uploading the photo again", async () => {
    const { view, saved } = await renderForm();
    await press(view, "Add profile photo");
    await act(async () => { view.root.findAllByType(Chip).find((c) => c.props.label === "Man")!.props.onPress(); });
    mocks.single.mockResolvedValueOnce({ data: null, error: new Error("lost response") });
    await press(view, "Save and continue");
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    await press(view, "Save and continue");
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledOnce();
    await act(async () => view.unmount());
  });
});

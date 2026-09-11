import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pick: vi.fn(), bytes: vi.fn(), upload: vi.fn(), update: vi.fn(), single: vi.fn(), remove: vi.fn(), draft: new Map<string,string>() }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", Keyboard: { dismiss: vi.fn() }, ActivityIndicator: "ActivityIndicator", Platform: { OS: "ios" }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} } }));
vi.mock("../components/ConfirmButton", () => ({ ConfirmButton: "ConfirmButton" }));
vi.mock("expo-image", () => ({ Image: "Image" }));
vi.mock("../components/Icon", () => ({ Icon: "Icon" }));
vi.mock("../lib/theme", () => ({ usePalette: () => ({}), type: { body: {}, label: {}, heading: {} }, space: { sm: 8, md: 16, lg: 24 }, radius: { md: 12 } }));
vi.mock("../lib/profile", () => ({ useAvatar: () => ({ data: null }), profileKey: (id: string) => ["profile",id] }));
vi.mock("../lib/profile-photo", () => ({ pickProfilePhoto: mocks.pick, photoBytes: mocks.bytes, removeDraftPhoto: vi.fn() }));
vi.mock("../lib/storage", () => ({ chunkedSecureStore: { getItem: async (k: string) => mocks.draft.get(k) ?? null, setItem: async (k: string,v: string) => { mocks.draft.set(k,v); }, removeItem: async (k: string) => { mocks.draft.delete(k); } } }));
vi.mock("../lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) }, from: () => ({ update: (v: unknown) => { mocks.update(v); return { eq: () => ({ select: () => ({ single: mocks.single }) }) }; } }) } }));
import { ProfileForm } from "../components/ProfileForm";
import { ConfirmButton } from "../components/ConfirmButton";
import type { Profile } from "../lib/profile-fields";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fresh: Profile = { user_id: "owner", display_name: null, avatar_path: null, onboarding_completed_at: null };
const existing: Profile = { ...fresh, display_name: "Pranav", onboarding_completed_at: "2026-09-09" };
beforeEach(() => { vi.clearAllMocks(); mocks.draft.clear(); mocks.pick.mockResolvedValue("file:///draft.jpg"); mocks.bytes.mockResolvedValue(new ArrayBuffer(2)); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null }); mocks.single.mockResolvedValue({ data: { ...existing, avatar_path: "owner/new.jpg" }, error: null }); });
async function renderForm(onboarding: boolean) {
  let view!: ReactTestRenderer;
  const saved = vi.fn();
  const profile = onboarding ? fresh : existing;
  await act(async () => { view = create(<QueryClientProvider client={new QueryClient()}><ProfileForm profile={profile} suggestedName={onboarding ? "Pranav" : ""} onboarding={onboarding} onSaved={saved} /></QueryClientProvider>); });
  return { view, saved };
}
const photoControls = (view: ReactTestRenderer) => view.root.findAll((n) => /profile photo/.test(String(n.props.accessibilityLabel ?? "")));
const textInputs = (view: ReactTestRenderer) => view.root.findAll((n) => String(n.type) === "TextInput");
const press = async (view: ReactTestRenderer, label: string) => { await act(async () => {
  if (label === "Add profile photo") await view.root.findByProps({ accessibilityLabel: label }).props.onPress();
  else { const button = view.root.findByType(ConfirmButton); if (await button.props.onConfirm()) button.props.onComplete(); }
}); };
describe("profile form", () => {
  it("onboarding asks for a name and nothing else", async () => {
    const { view } = await renderForm(true);
    expect(photoControls(view)).toHaveLength(0);
    const inputs = textInputs(view);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.props.accessibilityLabel).toBe("Name");
    await act(async () => view.unmount());
  });
  it("editing from Settings offers the photo and the name, and no phone", async () => {
    const { view } = await renderForm(false);
    expect(photoControls(view)).toHaveLength(1);
    const inputs = textInputs(view);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.props.accessibilityLabel).toBe("Name");
    expect(view.root.findAll((n) => /phone/i.test(String(n.props.accessibilityLabel ?? "")))).toHaveLength(0);
    await act(async () => view.unmount());
  });
  it("onboarding completes with just a name, clears the draft, and sends nothing else", async () => {
    const { view, saved } = await renderForm(true);
    await press(view, "Save and continue");
    expect(mocks.upload).not.toHaveBeenCalled();
    const payload = mocks.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toEqual({ display_name: "Pranav", avatar_path: null });
    expect(saved).toHaveBeenCalledOnce();
    expect(mocks.draft.size).toBe(0);
    await act(async () => view.unmount());
  });
  it("retains the entered name after an upload failure and completes only after the retry succeeds", async () => {
    const { view, saved } = await renderForm(false);
    await press(view, "Add profile photo");
    mocks.upload.mockResolvedValueOnce({ error: new Error("network") });
    await press(view, "Save changes");
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(view.root.findByProps({ accessibilityLabel: "Name" }).props.value).toBe("Pranav");
    await press(view, "Save changes");
    expect(mocks.update).toHaveBeenCalledWith({ display_name: "Pranav", avatar_path: expect.stringMatching(/^owner\/.+\.jpg$/) });
    expect(saved).toHaveBeenCalledOnce();
    await act(async () => view.unmount());
  });
  it("retries a failed profile write without uploading the photo again", async () => {
    const { view, saved } = await renderForm(false);
    await press(view, "Add profile photo");
    mocks.single.mockResolvedValueOnce({ data: null, error: new Error("lost response") });
    await press(view, "Save changes");
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    await press(view, "Save changes");
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledOnce();
    await act(async () => view.unmount());
  });
});

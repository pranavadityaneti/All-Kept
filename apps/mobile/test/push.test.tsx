import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  device: { isDevice: true },
  getPermissions: vi.fn(), requestPermissions: vi.fn(), getToken: vi.fn(), rpc: vi.fn(),
  appState: null as null | ((state: string) => void), removed: vi.fn(),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p1" } } } } }));
vi.mock("expo-device", () => ({ get isDevice() { return m.device.isDevice; } }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(), setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 },
  getPermissionsAsync: m.getPermissions, requestPermissionsAsync: m.requestPermissions, getExpoPushTokenAsync: m.getToken,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, Linking: { openSettings: vi.fn() },
  AppState: { addEventListener: (_: string, cb: (state: string) => void) => { m.appState = cb; return { remove: m.removed }; } },
}));
vi.mock("../lib/supabase", () => ({ supabase: { rpc: m.rpc } }));
import { refreshPush, usePushRefresh } from "../lib/push";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const allowed = () => m.getPermissions.mockResolvedValue({ granted: true, status: "granted" });
beforeEach(() => {
  vi.clearAllMocks(); m.device.isDevice = true; m.appState = null;
  m.getToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  m.rpc.mockResolvedValue({ error: null });
});

describe("recording this phone again, without asking", () => {
  it("never asks: a phone that has not allowed notifications is left alone", async () => {
    m.getPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    expect(await refreshPush("u1")).toEqual({ ok: false, reason: "denied" });
    expect(m.requestPermissions).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("a phone that allows them is recorded against the person again — a changed token is mended", async () => {
    allowed();
    expect(await refreshPush("u1")).toEqual({ ok: true, token: "ExponentPushToken[abc]" });
    expect(m.rpc).toHaveBeenCalledWith("claim_push_token", { p_token: "ExponentPushToken[abc]", p_platform: "ios" });
    expect(m.requestPermissions).not.toHaveBeenCalled();
  });

  it("a simulator has nothing to record", async () => {
    m.device.isDevice = false;
    expect(await refreshPush("u1")).toEqual({ ok: false, reason: "simulator" });
    expect(m.getPermissions).not.toHaveBeenCalled();
  });
});

describe("while the person has said yes", () => {
  function Probe({ userId, wants }: { userId: string | null; wants: boolean }) { usePushRefresh(userId, wants); return null; }
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("the phone is recorded when the app opens and each time it comes back to the front", async () => {
    allowed();
    await act(async () => { create(<Probe userId="u1" wants />); });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { m.appState!("background"); });
    await act(async () => { m.appState!("active"); });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("not while they haven't, nor when no one is signed in; and saying no stops it", async () => {
    allowed();
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(<Probe userId="u1" wants={false} />); });
    await act(async () => { view.update(<Probe userId={null} wants />); });
    await flush();
    expect(m.rpc).not.toHaveBeenCalled();
    await act(async () => { view.update(<Probe userId="u1" wants />); });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { view.update(<Probe userId="u1" wants={false} />); });
    expect(m.removed).toHaveBeenCalled();
  });
});

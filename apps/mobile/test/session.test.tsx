import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ callback: null as null | ((event: string, session: unknown) => void), getSession: vi.fn(), anonymous: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), refresh: vi.fn(), stop: vi.fn() }));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock("../lib/supabase", () => ({ supabase: { auth: {
  getSession: mocks.getSession, signInAnonymously: mocks.anonymous,
  onAuthStateChange: (cb: (event: string, session: unknown) => void) => { mocks.subscribe(); mocks.callback = cb; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; },
  startAutoRefresh: mocks.refresh, stopAutoRefresh: mocks.stop,
}, realtime: { setAuth: vi.fn() } } }));
import { SessionProvider, useSession } from "../lib/session";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Consumer() { const state = useSession(); return <span>{state.status === "ready" ? state.userId : state.status}</span>; }
beforeEach(() => { vi.clearAllMocks(); mocks.getSession.mockResolvedValue({ data: { session: null }, error: null }); });
it("one shared subscription updates all screens on sign-in and sign-out without creating guests", async () => {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<SessionProvider><Consumer /><Consumer /></SessionProvider>); });
  expect(mocks.subscribe).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.anonymous).not.toHaveBeenCalled();
  expect(view.root.findAllByType("span").map((s) => s.children[0])).toEqual(["signed_out","signed_out"]);
  await act(async () => { mocks.callback!("SIGNED_IN", { access_token: "fake", user: { id: "owner-a", is_anonymous: false } }); });
  expect(view.root.findAllByType("span").map((s) => s.children[0])).toEqual(["owner-a","owner-a"]);
  await act(async () => { mocks.callback!("SIGNED_OUT", null); });
  expect(view.root.findAllByType("span").map((s) => s.children[0])).toEqual(["signed_out","signed_out"]);
  await act(async () => view.unmount());
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("a late bootstrap response cannot overwrite a newer account", async () => {
  let resolve!: (value: unknown) => void;
  mocks.getSession.mockReturnValue(new Promise((r) => { resolve = r; }));
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<SessionProvider><Consumer /></SessionProvider>); });
  await act(async () => { mocks.callback!("SIGNED_IN", { access_token: "fake", user: { id: "new-owner", is_anonymous: false } }); });
  await act(async () => { resolve({ data: { session: null }, error: null }); });
  expect(view.root.findByType("span").children[0]).toBe("new-owner");
  await act(async () => view.unmount());
});
it("a late bootstrap failure cannot overwrite a newer account", async () => {
  let reject!: (reason: Error) => void;
  mocks.getSession.mockReturnValue(new Promise((_resolve, r) => { reject = r; }));
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<SessionProvider><Consumer /></SessionProvider>); });
  await act(async () => { mocks.callback!("SIGNED_IN", { access_token: "fake", user: { id: "new-owner", is_anonymous: false } }); });
  await act(async () => { reject(new Error("Offline")); });
  expect(view.root.findByType("span").children[0]).toBe("new-owner");
  await act(async () => view.unmount());
});

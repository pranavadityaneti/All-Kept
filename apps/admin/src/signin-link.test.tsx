import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  initialize: vi.fn(async () => ({ error: null as { message: string } | null })),
  getSession: vi.fn(async () => ({ data: { session: null as unknown } })),
  // The real library announces the initial (absent) session once it has looked at the address.
  onAuthStateChange: vi.fn((cb: (event: string, session: null) => void) => {
    setTimeout(() => cb("INITIAL_SESSION", null), 0);
    return { data: { subscription: { unsubscribe() {} } } };
  }),
}));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  configured: true,
  demoEnabled: false,
  supabase: { auth },
}));
import App from "./App";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alerts = (tree: ReactTestRenderer) => tree.root.findAllByProps({ role: "alert" }).map((a) => String(a.children.join("")));
afterEach(() => { delete (globalThis as { window?: unknown }).window; auth.initialize.mockReset(); auth.getSession.mockReset(); });

it("says why a sign-in link could not be completed, instead of a blank sign-in screen", async () => {
  auth.initialize.mockResolvedValue({ error: { message: "code challenge does not match previously saved code verifier" } });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<App />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(alerts(tree).join(" ")).toContain("Could not complete sign-in: code challenge does not match previously saved code verifier");
});

it("says when a sign-in link was opened somewhere other than where it was started", async () => {
  auth.initialize.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  (globalThis as { window?: unknown }).window = { location: { search: "?code=abc-123" } };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<App />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(alerts(tree).join(" ")).toContain("different window");
});

it("shows nothing extra when there is no link in the address", async () => {
  auth.initialize.mockResolvedValue({ error: null });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<App />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(alerts(tree)).toEqual([]);
});

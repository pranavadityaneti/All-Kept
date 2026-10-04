import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cancelAll: vi.fn(), dismissAll: vi.fn() }));
vi.mock("expo-notifications", () => ({ cancelAllScheduledNotificationsAsync: m.cancelAll, dismissAllNotificationsAsync: m.dismissAll }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import type { SessionState } from "../lib/auth-state";
import { forgetLocalNotifications, useForgetOnSignOut } from "../lib/reminders";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ready = (userId: string): SessionState => ({ status: "ready", userId, anonymous: false, user: { id: userId } as never });
const SIGNED_OUT: SessionState = { status: "signed_out" };
function Probe({ session }: { session: SessionState }) { useForgetOnSignOut(session); return null; }
/** The session as it moves, one state after another; how many times the phone forgot. */
async function through(...states: SessionState[]): Promise<number> {
  let view!: ReturnType<typeof create>;
  await act(async () => { view = create(<Probe session={states[0]!} />); });
  for (const s of states.slice(1)) await act(async () => { view.update(<Probe session={s} />); });
  return m.cancelAll.mock.calls.length;
}

beforeEach(() => { vi.clearAllMocks(); m.cancelAll.mockResolvedValue(undefined); m.dismissAll.mockResolvedValue(undefined); });

describe("when the phone stops being signed in to an account", () => {
  it("forgets the reminders still to come and the notifications already shown", async () => {
    await forgetLocalNotifications();
    expect([m.cancelAll.mock.calls.length, m.dismissAll.mock.calls.length]).toEqual([1, 1]);
  });

  it("does so on sign-out — the same for a deleted account or a session that ended — and when another account signs in", async () => {
    expect(await through({ status: "loading" }, ready("u1"), SIGNED_OUT)).toBe(1);
    vi.clearAllMocks();
    expect(await through({ status: "loading" }, ready("u1"), ready("u2"))).toBe(1);
  });

  it("not at launch, nor when the session can't be read for a moment, nor when the same account signs back in", async () => {
    const error: SessionState = { status: "error", message: "x", anonymousDisabled: false };
    expect(await through({ status: "loading" }, ready("u1"), error, ready("u1"))).toBe(0);
    expect(await through({ status: "loading" }, SIGNED_OUT, ready("u1"))).toBe(0);
    expect(await through({ status: "loading" }, ready("u1"), SIGNED_OUT, ready("u1"))).toBe(1);
  });
});

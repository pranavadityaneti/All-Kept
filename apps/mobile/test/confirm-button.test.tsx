import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reduced: false, announce: vi.fn(), haptic: vi.fn(), spring: vi.fn() }));
vi.mock("react-native", () => {
  const animation = () => ({ start: vi.fn(), stop: vi.fn() });
  return { View: "View", Pressable: "Pressable", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (v: unknown) => v }, AccessibilityInfo: { announceForAccessibility: mocks.announce }, Animated: {
    View: "AnimatedView", Value: class { setValue() {} stopAnimation() {} interpolate() { return 0; } },
    timing: animation, spring: (...args: unknown[]) => { mocks.spring(...args); return animation(); }, loop: animation, sequence: animation,
  } };
});
vi.mock("expo-haptics", () => ({ notificationAsync: mocks.haptic, NotificationFeedbackType: { Success: "success" } }));
vi.mock("../components/Icon", () => ({ Icon: "Icon" }));
vi.mock("../lib/theme", () => ({ usePalette: () => ({}) }));
vi.mock("../lib/motion", () => ({ useReducedMotion: () => mocks.reduced }));
import { ConfirmButton } from "../components/ConfirmButton";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.reduced = false; mocks.haptic.mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); });
async function render(onConfirm: () => Promise<boolean>) {
  const onComplete = vi.fn(); let view!: ReactTestRenderer;
  await act(async () => { view = create(<ConfirmButton label="Save and continue" onConfirm={onConfirm} onComplete={onComplete} />); });
  const button = () => view.root.find((n) => String(n.type) === "Pressable");
  return { view, onComplete, button };
}
it("blocks duplicate saves, then shows confirmed success before continuing", async () => {
  let resolve!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
  const { view, onComplete, button } = await render(save);
  await act(async () => { button().props.onPress(); button().props.onPress(); });
  expect(save).toHaveBeenCalledOnce();
  expect(button().props.accessibilityState.busy).toBe(true);
  expect(mocks.announce).not.toHaveBeenCalled();
  await act(async () => { resolve(true); });
  expect(button().props.accessibilityLabel).toBe("Profile saved");
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(450); });
  expect(onComplete).toHaveBeenCalledOnce();
  await act(async () => view.unmount());
});
it("a failed save stays retryable and never announces success", async () => {
  const save = vi.fn().mockResolvedValue(false);
  const { view, onComplete, button } = await render(save);
  await act(async () => { button().props.onPress(); });
  expect(button().props.disabled).toBeFalsy();
  expect(mocks.announce).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => { button().props.onPress(); });
  expect(save).toHaveBeenCalledTimes(2);
  await act(async () => view.unmount());
});
it("reduced motion skips the bounce and unmount cancels delayed navigation", async () => {
  mocks.reduced = true;
  const { view, onComplete, button } = await render(async () => true);
  await act(async () => { button().props.onPressIn(); button().props.onPress(); });
  expect(mocks.spring).not.toHaveBeenCalled();
  await act(async () => view.unmount());
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(onComplete).not.toHaveBeenCalled();
});

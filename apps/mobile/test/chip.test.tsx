import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: "View", Pressable: "Pressable", Text: "Text", StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 } }));
vi.mock("../components/PlatformLogo", () => ({ PlatformLogo: "PlatformLogo" }));
vi.mock("../lib/theme", () => ({ usePalette: () => ({}), radius: { pill: 999, md: 12 }, space: { xs: 4, sm: 8, md: 12 }, type: { label: {} } }));
import { Chip } from "../components/Chip";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(element: React.ReactElement) {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(element); });
  return view;
}

it("a chip that can't be tapped says its label to a screen reader as one thing", async () => {
  const view = await render(<Chip label="Suggested" accessibilityLabel="Suggested, not from your saves" />);
  const chip = view.root.find((n) => String(n.type) === "View" && n.props.accessible === true);
  expect(chip.props.accessibilityLabel).toBe("Suggested, not from your saves");
});

it("without a label of its own, it says the words it shows", async () => {
  const view = await render(<Chip label="matcha" />);
  const chip = view.root.find((n) => String(n.type) === "View" && n.props.accessible === true);
  expect(chip.props.accessibilityLabel).toBe("matcha");
});

it("a chip that can be tapped is still a button with its label", async () => {
  const view = await render(<Chip label="Seoul 15" accessibilityLabel="Seoul, 15 saves" onPress={() => undefined} />);
  const button = view.root.find((n) => String(n.type) === "Pressable");
  expect(button.props.accessibilityRole).toBe("button");
  expect(button.props.accessibilityLabel).toBe("Seoul, 15 saves");
});

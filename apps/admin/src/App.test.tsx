import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  demoEnabled: true,
}));
import App from "./App";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it("navigates from chart data to table data, back, and to the same page without crashing or staying in loading", async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<App />);
  });
  const navigate = async (label: string) => {
    const nav = tree.root.findByProps({ "aria-label": "Main navigation" });
    const button = nav
      .findAllByType("button")
      .find((b) =>
        b.findAllByType("span").some((s) => s.children.includes(label)),
      );
    expect(button).toBeDefined();
    await act(async () => {
      button!.props.onClick();
    });
  };
  expect(tree.root.findAllByType("table")).toHaveLength(0);
  await navigate("Users");
  expect(tree.root.findAllByType("table")).toHaveLength(1);
  expect(tree.root.findAllByType("tbody")[0]?.findAllByType("tr")).toHaveLength(
    8,
  );
  await navigate("Users");
  expect(tree.root.findAllByType("table")).toHaveLength(1);
  await navigate("Overview");
  expect(tree.root.findAllByType("table")).toHaveLength(0);
  expect(tree.root.findAllByProps({ className: "metrics" })).toHaveLength(1);
  // The waitlist page carries both: a metrics strip with its chart, and the table beneath.
  await navigate("Waitlist");
  expect(tree.root.findAllByProps({ className: "metrics" })).toHaveLength(1);
  expect(tree.root.findAllByType("table")).toHaveLength(1);
  expect(tree.root.findAllByType("tbody")[0]?.findAllByType("tr")).toHaveLength(
    25,
  );
  await act(async () => {
    tree.unmount();
  });
});

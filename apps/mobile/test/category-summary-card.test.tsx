import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { CategorySummaryResponse } from "@allkept/contracts";
const mocks = vi.hoisted(() => ({ summary: { data: undefined as CategorySummaryResponse | undefined, looksAgain: false } }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 } }));
vi.mock("../components/Icon", () => ({ Icon: "Icon" }));
vi.mock("../components/InterestPills", () => ({ InterestPill: "InterestPill" }));
vi.mock("../lib/theme", () => ({ usePalette: () => ({}), type: { body: {}, label: {} }, space: { xs: 4, sm: 8, md: 16 }, radius: { lg: 16 } }));
vi.mock("../lib/category-names", () => ({ categoryDisplayName: (c: string) => c }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/category-summary", async () => ({ ...(await vi.importActual<object>("../lib/category-summary")), useCategorySummary: () => mocks.summary }));
import { CategorySummary } from "../components/CategorySummary";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tech: CategorySummaryResponse = {
  count: 77, shapes: { vertical: 50, post: 27 }, intents: { watch: 43 }, names: [],
  themes: ["Claude Code workflows and agent setups", "Codex for refactors"], freshness: "stored",
};
const themesShown = (view: ReactTestRenderer) => view.root.findAll((n) => String(n.type) === "Text" && n.props.children === tech.themes[0]).length === 1;
const card = (category: string) => <CategorySummary category={category} taken={[]} onName={() => undefined} />;
async function render(category: string) {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(card(category)); });
  return view;
}
const tapRow = async (view: ReactTestRenderer) => { await act(async () => { view.root.findByProps({ accessibilityRole: "button" }).props.onPress(); }); };

describe("the summary card's fold", () => {
  it("opens unfolded every time a category is opened, whatever was folded before", async () => {
    mocks.summary.data = tech;
    const view = await render("Tech & tools");
    expect(themesShown(view)).toBe(true);
    await tapRow(view);
    expect(themesShown(view)).toBe(false);
    // The same card moving to another category: open again.
    await act(async () => { view.update(card("Entertainment")); });
    expect(themesShown(view)).toBe(true);
    // Back to the folded one: it was folded for that visit only.
    await act(async () => { view.update(card("Tech & tools")); });
    expect(themesShown(view)).toBe(true);
    // A fresh card for a category folded a moment ago: open, since nothing is remembered.
    await tapRow(view);
    expect(themesShown(view)).toBe(false);
    expect(themesShown(await render("Tech & tools"))).toBe(true);
  });
});

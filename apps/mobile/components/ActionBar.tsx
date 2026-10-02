import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, usePalette } from "../lib/theme";

/**
 * The one thing to do next, pinned under a screen's scrolling content: a summary line above it if
 * the step has one, then the action, with room for the home indicator. It stays put while the
 * content scrolls, so the next step is never scrolled out of reach.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: p.bg, borderTopColor: p.border, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
});

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Wordmark } from "./Wordmark";
import { space } from "../lib/theme";

/** Reserved even when a screen shows no mark, so its content still begins where every other screen's does. */
export const HEADER_HEIGHT = 44;

/**
 * The bar every screen opens with.
 *
 * One component rather than a copy per screen. Three copies is how the mark came to sit eight points
 * lower on Home than on Library — Home's bar scrolled inside the page and took the page's padding,
 * Library's sat above it with its own — which reads as the logo jumping about as you change tabs.
 */
export function ScreenHeader({ children, mark = true }: { children?: ReactNode; mark?: boolean }) {
  return (
    <View style={styles.header}>
      {mark ? <Wordmark /> : <View />}
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    minHeight: HEADER_HEIGHT, paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
